import { describe, expect, it, vi } from 'vitest'

import { OllamaLauncher } from './ollama-launcher'

function createLauncher(options: { running?: boolean, installed?: boolean, platform?: NodeJS.Platform } = {}) {
  let now = 0
  const launch = vi.fn()
  const launcher = new OllamaLauncher({
    appPath: 'C:/Ollama/ollama app.exe',
    isRunning: async () => options.running ?? false,
    fileExists: () => options.installed ?? true,
    launch,
    now: () => now,
    platform: options.platform ?? 'win32',
  })
  return { launcher, launch, advance: (ms: number) => now += ms }
}

describe('ollamaLauncher', () => {
  // ROOT CAUSE:
  //
  // Ollama was not running after the computer started, so every voice command failed with "Failed to fetch".
  it('starts the Ollama app when it is installed and not running', async () => {
    const { launcher, launch } = createLauncher()

    await expect(launcher.ensureRunning()).resolves.toBe('launched')
    expect(launch).toHaveBeenCalledWith('C:/Ollama/ollama app.exe')
  })

  it('does nothing when Ollama already runs', async () => {
    const { launcher, launch } = createLauncher({ running: true })

    await expect(launcher.ensureRunning()).resolves.toBe('running')
    expect(launch).not.toHaveBeenCalled()
  })

  it('waits a minute before it starts Ollama again', async () => {
    const { launcher, launch, advance } = createLauncher()

    await launcher.ensureRunning()
    advance(30_000)
    await expect(launcher.ensureRunning()).resolves.toBe('cooldown')
    advance(30_000)
    await expect(launcher.ensureRunning()).resolves.toBe('launched')
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it('reports a missing install and other platforms', async () => {
    await expect(createLauncher({ installed: false }).launcher.ensureRunning()).resolves.toBe('missing')
    await expect(createLauncher({ platform: 'darwin' }).launcher.ensureRunning()).resolves.toBe('unsupported')
  })
})
