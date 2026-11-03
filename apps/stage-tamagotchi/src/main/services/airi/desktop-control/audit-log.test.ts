import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AuditLog } from './audit-log'

describe('auditLog', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory)
      await rm(directory, { recursive: true, force: true })
  })

  it('appends JSON lines and rotates a full file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shiro-audit-'))
    const path = join(directory, 'logs', 'audit.jsonl')
    const log = new AuditLog({ path, maxBytes: 300, now: () => new Date('2026-11-03T08:00:00Z') })

    await log.write({ action: 'app-open', summary: 'Open Discord', decision: 'allowed', ok: true })
    await log.write({ action: 'terminal-run', summary: 'format D:', decision: 'blocked', ok: false, error: 'It formats a drive.' })
    await log.write({ action: 'file-delete', summary: 'D:\\old.txt', decision: 'denied', ok: false })

    const rotated = (await readFile(`${path}.1`, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const current = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(rotated.map(entry => entry.action)).toEqual(['app-open', 'terminal-run'])
    expect(current).toEqual([{ time: '2026-11-03T08:00:00.000Z', action: 'file-delete', summary: 'D:\\old.txt', decision: 'denied', ok: false }])
  })

  it('reads the newest entries first and returns an empty list without a file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shiro-audit-'))
    const path = join(directory, 'audit.jsonl')
    const log = new AuditLog({ path, now: () => new Date('2026-11-03T08:00:00Z') })
    expect(await log.readRecent(5)).toEqual([])

    await log.write({ action: 'app-open', summary: 'Open Discord', decision: 'allowed', ok: true })
    await log.write({ action: 'system-status', summary: 'Read system status: gpu', decision: 'allowed', ok: true })

    expect((await log.readRecent(1)).map(entry => entry.action)).toEqual(['system-status'])
    expect((await log.readRecent(5)).map(entry => entry.action)).toEqual(['system-status', 'app-open'])
  })
})
