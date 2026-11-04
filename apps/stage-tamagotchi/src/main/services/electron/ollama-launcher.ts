import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The time between two launch attempts, so a failed start does not open many Ollama processes. */
const LAUNCH_COOLDOWN_MS = 60_000

export type OllamaLaunchResult = 'running' | 'launched' | 'missing' | 'cooldown' | 'unsupported'

export interface OllamaLauncherOptions {
  /** Path to "ollama app.exe". The default is the per-user Windows install location. */
  appPath?: string
  isRunning?: () => Promise<boolean>
  fileExists?: (path: string) => boolean
  launch?: (path: string) => void
  now?: () => number
  platform?: NodeJS.Platform
}

/**
 * Starts the Ollama desktop app when it is installed but not running.
 *
 * Shiro needs Ollama to think. Ollama starts with Windows, but it can be closed or crash, and every chat
 * then fails with "Failed to fetch". The desktop app starts the server with the model location from its own
 * settings, so Shiro launches the app instead of `ollama serve`.
 */
export class OllamaLauncher {
  private lastLaunchAt = Number.NEGATIVE_INFINITY

  constructor(private readonly options: OllamaLauncherOptions = {}) {}

  private get appPath() {
    return this.options.appPath ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama app.exe')
  }

  async ensureRunning(): Promise<OllamaLaunchResult> {
    if ((this.options.platform ?? process.platform) !== 'win32')
      return 'unsupported'
    if (await (this.options.isRunning ?? isOllamaRunning)())
      return 'running'
    if (!(this.options.fileExists ?? existsSync)(this.appPath))
      return 'missing'

    const now = (this.options.now ?? Date.now)()
    if (now - this.lastLaunchAt < LAUNCH_COOLDOWN_MS)
      return 'cooldown'

    this.lastLaunchAt = now
    ;(this.options.launch ?? launchDetached)(this.appPath)
    return 'launched'
  }
}

async function isOllamaRunning() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(1500) })
    return response.ok
  }
  catch {
    return false
  }
}

/**
 * Starts the app through Explorer, as a click in Explorer does.
 * A direct child process inherited Electron's open handles, such as the remote debugging socket, and kept them
 * after Shiro quit. Explorer starts Ollama as its own child, so Ollama owns only its own handles.
 */
function launchDetached(path: string) {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const child = spawn(join(systemRoot, 'explorer.exe'), [path], { detached: true, stdio: 'ignore', windowsHide: true })
  child.once('error', error => console.warn('[ollama-launcher] Failed to start Ollama:', error))
  child.unref()
}
