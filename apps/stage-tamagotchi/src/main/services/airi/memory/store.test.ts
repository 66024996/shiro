import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryStore } from './store'

describe('memoryStore', () => {
  let directory: string
  let now: number
  const stores: MemoryStore[] = []

  function createStore() {
    const store = new MemoryStore({
      databasePath: join(directory, 'nested', 'memory.duckdb'),
      now: () => now,
    })
    stores.push(store)
    return store
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shiro-memory-'))
    now = 1_000_000
  })

  afterEach(async () => {
    await Promise.all(stores.splice(0).map(store => store.close()))
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps a long-term memory after the store is reopened', async () => {
    const first = createStore()
    const entry = await first.remember({ kind: 'long-term', text: '  ผู้ใช้ใช้ VS Code  ' })
    await first.close()

    const reopened = await createStore().list()

    expect(entry.text).toBe('ผู้ใช้ใช้ VS Code')
    expect(entry.expiresAt).toBeNull()
    expect(reopened).toEqual([entry])
  })

  // DuckDB-wasm 1.29 with NODE_FS opened an existing file read-only, so the second write failed
  // with "File is not opened in write mode". This keeps the native store honest about restarts.
  it('writes to an existing database after a restart', async () => {
    const first = createStore()
    const before = await first.remember({ kind: 'long-term', text: 'ชอบชาเย็น' })
    await first.close()

    now += 1
    const reopened = createStore()
    const after = await reopened.remember({ kind: 'long-term', text: 'ใช้ VS Code' })

    expect(await reopened.list()).toEqual([before, after])
  })

  it('removes a temporary memory after it expires', async () => {
    const store = createStore()
    const temporary = await store.remember({ kind: 'temporary', text: 'กำลังเล่นเกม', ttlHours: 2 })
    // The list orders by creation time, so the second memory needs a later timestamp.
    now += 1
    const longTerm = await store.remember({ kind: 'long-term', text: 'ชื่อผู้ใช้คือปาล์ม' })

    now += 2 * 3_600_000 - 2
    expect(await store.list()).toEqual([temporary, longTerm])

    now += 1
    expect(await store.list()).toEqual([longTerm])
  })

  it('forgets only the requested memories', async () => {
    const store = createStore()
    const kept = await store.remember({ kind: 'long-term', text: 'ชอบชาเย็น' })
    const forgotten = await store.remember({ kind: 'long-term', text: 'ชอบกาแฟดำ' })

    const removed = await store.forget({ ids: [forgotten.id, 'missing-id'] })

    expect(removed).toEqual([forgotten])
    expect(await store.list()).toEqual([kept])
  })

  it('stores SQL-like text as plain data', async () => {
    const store = createStore()
    const text = `x'); DROP TABLE memories; --`

    await store.remember({ kind: 'long-term', text })

    expect((await store.list()).map(entry => entry.text)).toEqual([text])
  })

  it('rejects an empty memory without writing it', async () => {
    const store = createStore()

    await expect(store.remember({ kind: 'long-term', text: '   ' })).rejects.toThrow()
    expect(await store.list()).toEqual([])
  })
})
