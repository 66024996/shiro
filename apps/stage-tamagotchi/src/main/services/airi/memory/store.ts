import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'

import type { MemoryEntry, MemoryKind, MemoryRememberRequest } from '../../../../shared/eventa/memory'

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { DuckDBInstance as DuckDB } from '@duckdb/node-api'
import { Mutex } from 'async-mutex'
import { array, integer, maxLength, maxValue, minLength, minValue, number, object, optional, parse, picklist, pipe, string, trim } from 'valibot'

/**
 * Upper bound on active memories. A full store rejects new memories, so the prompt context
 * stays small enough for a local model with a short context window.
 */
const MAX_ACTIVE_MEMORIES = 200

const rememberRequestSchema = object({
  kind: picklist(['long-term', 'temporary'] satisfies MemoryKind[]),
  text: pipe(string(), trim(), minLength(1), maxLength(500)),
  ttlHours: optional(pipe(number(), integer(), minValue(1), maxValue(24 * 30)), 24),
})

const forgetRequestSchema = object({
  ids: pipe(array(pipe(string(), minLength(1), maxLength(64))), maxLength(50)),
})

/** Converts one DuckDB row. `kind` is only ever written by {@link MemoryStore.remember}. */
function toEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: String(row.id),
    kind: row.kind === 'temporary' ? 'temporary' : 'long-term',
    text: String(row.text),
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
  }
}

async function readEntries(connection: DuckDBConnection, sql: string, values: (string | number | null)[] = []) {
  const reader = await connection.runAndReadAll(sql, values)
  return reader.getRowObjectsJS().map(toEntry)
}

export interface MemoryStoreOptions {
  /** DuckDB file. The parent directory is created on first use. */
  databasePath: string
  /** @default Date.now */
  now?: () => number
}

interface OpenDatabase {
  instance: DuckDBInstance
  connection: DuckDBConnection
}

/**
 * Persistent memory for Shiro, stored in one DuckDB file in the main process.
 *
 * The main process is the only writer, so every renderer window sees the same memories.
 * The database opens on the first call and stays open until {@link close}.
 * A mutex runs one operation at a time, so an expiry sweep cannot interleave with a write.
 */
export class MemoryStore {
  private readonly mutex = new Mutex()
  private readonly now: () => number
  private database: Promise<OpenDatabase> | undefined

  constructor(private readonly options: MemoryStoreOptions) {
    this.now = options.now ?? Date.now
  }

  /** Removes expired temporary memories, then returns the active memories oldest first. */
  list(): Promise<MemoryEntry[]> {
    return this.mutex.runExclusive(async () => {
      const { connection } = await this.open()
      await this.removeExpired(connection)
      return readEntries(connection, `SELECT * FROM memories ORDER BY created_at, id`)
    })
  }

  /** Validates and stores one memory. Rejects when the input is invalid or the store is full. */
  async remember(request: MemoryRememberRequest): Promise<MemoryEntry> {
    const input = parse(rememberRequestSchema, request)

    return this.mutex.runExclusive(async () => {
      const { connection } = await this.open()
      await this.removeExpired(connection)

      const reader = await connection.runAndReadAll(`SELECT count(*)::INTEGER AS total FROM memories`)
      const total = Number(reader.getRowObjectsJS()[0]?.total ?? 0)
      if (total >= MAX_ACTIVE_MEMORIES)
        throw new Error(`Memory is full (${MAX_ACTIVE_MEMORIES} entries). Ask the user which memories to forget first.`)

      const createdAt = this.now()
      const entry: MemoryEntry = {
        id: randomUUID().slice(0, 8),
        kind: input.kind,
        text: input.text,
        createdAt,
        expiresAt: input.kind === 'temporary' ? createdAt + input.ttlHours * 3_600_000 : null,
      }

      await connection.run(
        `INSERT INTO memories (id, kind, text, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)`,
        [entry.id, entry.kind, entry.text, entry.createdAt, entry.expiresAt],
      )
      return entry
    })
  }

  /** Removes the listed memories and returns them. Unknown IDs are ignored. */
  async forget(request: { ids: string[] }): Promise<MemoryEntry[]> {
    const { ids } = parse(forgetRequestSchema, request)
    if (ids.length === 0)
      return []

    return this.mutex.runExclusive(async () => {
      const { connection } = await this.open()
      // One positional parameter per ID keeps every value bound, never inlined into SQL.
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ')
      return readEntries(connection, `DELETE FROM memories WHERE id IN (${placeholders}) RETURNING *`, ids)
    })
  }

  /** Closes the database file. A later call opens it again. */
  close(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const database = this.database
      this.database = undefined
      if (!database)
        return

      const { instance, connection } = await database
      connection.closeSync()
      instance.closeSync()
    })
  }

  private open(): Promise<OpenDatabase> {
    this.database ??= this.connect().catch((error) => {
      // A failed open is not cached, so the next operation retries it.
      this.database = undefined
      throw error
    })
    return this.database
  }

  private async connect(): Promise<OpenDatabase> {
    await mkdir(dirname(this.options.databasePath), { recursive: true })
    const instance = await DuckDB.create(this.options.databasePath)
    const connection = await instance.connect()
    await connection.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id VARCHAR PRIMARY KEY,
        kind VARCHAR NOT NULL,
        text VARCHAR NOT NULL,
        created_at DOUBLE NOT NULL,
        expires_at DOUBLE
      )
    `)
    return { instance, connection }
  }

  private async removeExpired(connection: DuckDBConnection) {
    await connection.run(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= $1`, [this.now()])
  }
}
