// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getBeatSyncInputByteFrequencyData,
  getBeatSyncState,
  inputAnalyserFFTSize,
  setBeatSyncHost,
  toggleBeatSync,
  updateBeatSyncParameters,
} from './detector'

describe('desktop Beat Sync host that starts on demand', () => {
  const ensure = vi.fn(async () => {})
  const started = vi.fn(async () => false)

  beforeAll(() => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  })

  beforeEach(() => {
    ensure.mockClear()
    started.mockClear()
    setBeatSyncHost({ ensure, started })
  })

  afterAll(() => {
    setBeatSyncHost(undefined)
    vi.unstubAllEnvs()
  })

  it('reports an inactive state without starting the detector', async () => {
    await expect(getBeatSyncState()).resolves.toEqual({ isActive: false })
    await expect(updateBeatSyncParameters({})).resolves.toBeUndefined()
    await expect(getBeatSyncInputByteFrequencyData()).resolves.toHaveLength(inputAnalyserFFTSize / 2)
    await expect(toggleBeatSync(false)).resolves.toBeUndefined()

    expect(ensure).not.toHaveBeenCalled()
  })

  it('starts the detector when Beat Sync is turned on', async () => {
    void toggleBeatSync(true)

    await vi.waitFor(() => expect(ensure).toHaveBeenCalledOnce())
  })
})
