import type { DesktopAction } from './policy'

import { Buffer } from 'node:buffer'
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

import { Mutex } from 'async-mutex'
import { boolean, object, optional, safeParse, string } from 'valibot'

/**
 * How the policy handled an action.
 *
 * - `allowed`: a safe action ran without a question.
 * - `approved` and `denied`: the user answered the confirmation dialog.
 * - `blocked`: the policy refused the action before any question.
 */
export type AuditDecision = 'allowed' | 'approved' | 'denied' | 'blocked'

export interface AuditEntry {
  action: DesktopAction
  /** What Shiro tried to do, for example the command text or the file path. Never file contents. */
  summary: string
  decision: AuditDecision
  ok: boolean
  error?: string
}

const auditRecordSchema = object({
  time: string(),
  action: string(),
  summary: string(),
  decision: string(),
  ok: boolean(),
  error: optional(string()),
})

/** One audit line as read back from the file. */
export interface AuditRecord {
  time: string
  action: string
  summary: string
  decision: string
  ok: boolean
  error?: string
}

/**
 * Appends one JSON line per desktop action. When the file passes `maxBytes`, it becomes
 * `<path>.1` and a new file starts, so the log keeps at most two files.
 */
export class AuditLog {
  private readonly mutex = new Mutex()

  constructor(private readonly options: { path: string, maxBytes?: number, now?: () => Date }) {}

  async write(entry: AuditEntry) {
    const line = `${JSON.stringify({ time: (this.options.now?.() ?? new Date()).toISOString(), ...entry })}\n`
    await this.mutex.runExclusive(async () => {
      await mkdir(dirname(this.options.path), { recursive: true })
      const size = await stat(this.options.path).then(info => info.size, () => 0)
      if (size + Buffer.byteLength(line) > (this.options.maxBytes ?? 1024 * 1024) && size > 0) {
        await rm(`${this.options.path}.1`, { force: true })
        await rename(this.options.path, `${this.options.path}.1`)
      }
      await appendFile(this.options.path, line, 'utf8')
    })
  }

  /** Returns the newest entries first, from the current file only. A line that does not parse is skipped. */
  async readRecent(limit: number): Promise<AuditRecord[]> {
    const text = await this.mutex.runExclusive(() => readFile(this.options.path, 'utf8').catch(() => ''))
    const records: AuditRecord[] = []
    for (const line of text.split(/\r?\n/).reverse()) {
      if (records.length >= limit)
        break
      if (!line.trim())
        continue
      try {
        const parsed = safeParse(auditRecordSchema, JSON.parse(line))
        if (parsed.success)
          records.push(parsed.output)
      }
      catch {}
    }
    return records
  }
}
