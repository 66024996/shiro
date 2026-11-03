import type { GameEntry, GamingConfig } from '../../../../shared/eventa/gaming'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { number } from 'valibot'

import { powerShellList, queryPowerShellJson } from '../desktop-control/windows-shell'

const execFileAsync = promisify(execFile)

export interface RunningProcess {
  pid: number
  name: string
}

/** Parses `tasklist /fo csv /nh` output: "Image Name","PID","Session Name","Session#","Mem Usage". */
export function parseTasklistCsv(output: string): RunningProcess[] {
  const processes: RunningProcess[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)","(\d+)"/.exec(line.trim())
    if (match)
      processes.push({ name: match[1]!, pid: Number(match[2]) })
  }
  return processes
}

/** Lists running processes with `tasklist`. It takes about 0.1 seconds, much less than PowerShell. */
export async function listProcessesWithTasklist(): Promise<RunningProcess[]> {
  const { stdout } = await execFileAsync('tasklist.exe', ['/fo', 'csv', '/nh'], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
  return parseTasklistCsv(stdout)
}

/** Lists the direct child process IDs of a process. */
export async function listChildProcessIds(pid: number): Promise<number[]> {
  return queryPowerShellJson(
    'ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$env:SHIRO_PARENT_PID" | ForEach-Object { $_.ProcessId }) -Compress',
    powerShellList(number()),
    { env: { SHIRO_PARENT_PID: String(pid) } },
  )
}

/** Returns the first listed game that runs, by a case-insensitive process name match. */
export function findRunningGame(games: GameEntry[], processes: RunningProcess[]): GameEntry | null {
  const running = new Set(processes.map(item => item.name.toLowerCase()))
  return games.find(game => running.has(game.processName.toLowerCase())) ?? null
}

export interface GameDetectorOptions {
  listProcesses: () => Promise<RunningProcess[]>
  getConfig: () => GamingConfig
  /** Called when the running listed game changes. */
  onGameChange: (game: GameEntry | null) => void
  /** Called with the process list on each check, for example to keep a process priority. */
  onProcesses?: (processes: RunningProcess[]) => void
  intervalMs?: number
}

/**
 * Checks the running processes every few seconds and reports the listed game that runs.
 * When auto detection is off, it reports no game and does not list processes.
 */
export class GameDetector {
  private timer: ReturnType<typeof setInterval> | undefined
  private checking = false
  private game: GameEntry | null = null

  constructor(private readonly options: GameDetectorOptions) {}

  get currentGame() {
    return this.game
  }

  start() {
    if (this.timer)
      return
    void this.check()
    this.timer = setInterval(() => void this.check(), this.options.intervalMs ?? 5000)
  }

  stop() {
    if (this.timer)
      clearInterval(this.timer)
    this.timer = undefined
  }

  /** Runs one check now. A check that is still running makes this call do nothing. */
  async check() {
    if (this.checking)
      return
    this.checking = true
    try {
      const config = this.options.getConfig()
      let next: GameEntry | null = null
      if (config.autoDetect) {
        const processes = await this.options.listProcesses()
        this.options.onProcesses?.(processes)
        next = findRunningGame(config.games, processes)
      }
      if (next?.processName !== this.game?.processName) {
        this.game = next
        this.options.onGameChange(next)
      }
    }
    catch (error) {
      console.warn('[gaming] Failed to check running games:', error)
    }
    finally {
      this.checking = false
    }
  }
}
