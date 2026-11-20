import type { RunningProcess } from './detector'

import { errorMessageFrom } from '@moeru/std'
import { array, object, safeParse, string } from 'valibot'

const ollamaLoadedModelsSchema = object({ models: array(object({ name: string() })) })

/** Ollama runs a model in these processes. */
const MODEL_PROCESS_NAMES = new Set(['llama-server.exe', 'ollama_llama_server.exe'])

export interface GamingResourcesOptions {
  ollamaBaseUrl: string
  /** Shiro's speech server. In Gaming Mode it loads the voice model only to speak a reply. */
  speechBaseUrl?: string
  listProcesses: () => Promise<RunningProcess[]>
  /** Sets a process priority. Throws when the process is gone or not accessible. */
  setPriority: (pid: number, priority: 'below-normal' | 'normal') => void
  /** The process ID of Shiro's speech server, if it runs. */
  speechPid: () => number | undefined
  /**
   * Lists the child process IDs of a process. In development the speech server starts through a
   * virtual environment launcher, and the child process does the work.
   */
  childPids?: (pid: number) => Promise<number[]>
  fetch?: typeof fetch
}

/**
 * Frees resources for a game while Gaming Mode is on.
 *
 * - It unloads the Ollama models, so the game gets the GPU memory. Ollama loads a model again for the next command.
 * - It turns on the speech server's memory saver. The voice model then loads only to speak a reply,
 *   and it unloads after a quiet period. Without the voice model, the speech server needs about 1 GB instead of 6 GB.
 * - It lowers the CPU priority of the model and speech processes, so the game runs first.
 *
 * Voice, speech, and commands keep working, only slower.
 */
export class GamingResources {
  private gaming = false
  private readonly lowered = new Set<number>()

  constructor(private readonly options: GamingResourcesOptions) {}

  get active() {
    return this.gaming
  }

  async setGaming(gaming: boolean) {
    if (gaming === this.gaming)
      return
    this.gaming = gaming
    await this.setSpeechMemorySaver(gaming)
    if (gaming) {
      await this.unloadModels()
      this.lowerPriorities(await this.options.listProcesses().catch(() => []))
      const speechPid = this.options.speechPid()
      const children = speechPid && this.options.childPids ? await this.options.childPids(speechPid).catch(() => []) : []
      this.lowerPids(children)
      return
    }

    for (const pid of this.lowered)
      this.trySetPriority(pid, 'normal')
    this.lowered.clear()
  }

  /** Lowers the priority of model and speech processes that started after Gaming Mode began. */
  lowerPriorities(processes: RunningProcess[]) {
    if (!this.gaming)
      return
    const pids = processes.filter(item => MODEL_PROCESS_NAMES.has(item.name.toLowerCase())).map(item => item.pid)
    const speechPid = this.options.speechPid()
    if (speechPid)
      pids.push(speechPid)
    this.lowerPids(pids)
  }

  private lowerPids(pids: number[]) {
    for (const pid of pids) {
      if (!this.lowered.has(pid) && this.trySetPriority(pid, 'below-normal'))
        this.lowered.add(pid)
    }
  }

  private trySetPriority(pid: number, priority: 'below-normal' | 'normal') {
    try {
      this.options.setPriority(pid, priority)
      return true
    }
    catch {
      return false
    }
  }

  private async setSpeechMemorySaver(enabled: boolean) {
    if (!this.options.speechBaseUrl)
      return
    const request = this.options.fetch ?? fetch
    try {
      await request(`${this.options.speechBaseUrl}/v1/system/memory-saver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
        signal: AbortSignal.timeout(10_000),
      })
    }
    catch (error) {
      console.warn('[gaming] Failed to change the speech memory saver:', errorMessageFrom(error) ?? 'Unknown error')
    }
  }

  private async unloadModels() {
    const request = this.options.fetch ?? fetch
    try {
      const response = await request(`${this.options.ollamaBaseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) })
      const parsed = safeParse(ollamaLoadedModelsSchema, await response.json())
      if (!parsed.success)
        return
      await Promise.all(parsed.output.models.map(model => request(`${this.options.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model: model.name, keep_alive: 0 }),
        signal: AbortSignal.timeout(10_000),
      })))
    }
    catch (error) {
      console.warn('[gaming] Failed to unload Ollama models:', errorMessageFrom(error) ?? 'Unknown error')
    }
  }
}
