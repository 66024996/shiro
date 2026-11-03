import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { readSystemStatus } from './system-status'

describe.runIf(process.platform === 'win32')('readSystemStatus on Windows', () => {
  it('reads every section from this machine', async () => {
    const status = await readSystemStatus()

    expect(status.cpu?.logicalCores).toBeGreaterThan(0)
    expect(status.cpu?.usagePercent).toBeGreaterThanOrEqual(0)
    expect(status.memory?.totalGiB).toBeGreaterThan(0)
    expect(status.gpu?.adapters.length).toBeGreaterThan(0)
    expect(status.storage?.some(drive => drive.kind === 'fixed')).toBe(true)
    expect(status.network).toBeInstanceOf(Array)
  }, 30_000)

  it('reads only the requested sections', async () => {
    const status = await readSystemStatus(['memory'])

    expect(status.memory).toBeDefined()
    expect(status.cpu).toBeUndefined()
    expect(status.gpu).toBeUndefined()
    expect(status.storage).toBeUndefined()
  })
})
