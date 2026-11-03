import type { ProcessSummary, ProcessTarget } from '../../../../shared/eventa/desktop-control'

import { cpus } from 'node:os'

import { nullable, number, object, string } from 'valibot'

import { normalizeAppName } from './app-catalog'
import { isProtectedProcessName } from './policy'
import { powerShellList, queryPowerShellJson } from './windows-shell'

/** App names mapped to their process names. Keys are normalized. */
const PROCESS_ALIASES: Record<string, string> = {
  'vscode': 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  'วีเอสโค้ด': 'code',
  'google chrome': 'chrome',
  'โครม': 'chrome',
  'edge': 'msedge',
  'microsoft edge': 'msedge',
  'word': 'winword',
  'microsoft word': 'winword',
  'excel': 'excel',
  'powerpoint': 'powerpnt',
  'ดิสคอร์ด': 'discord',
  'สตีม': 'steam',
  'obs': 'obs64',
  'obs studio': 'obs64',
  'notepad': 'notepad',
  'โน้ตแพด': 'notepad',
}

const MAX_PROCESS_LIST = 50

const perfProcessSchema = powerShellList(object({ Name: string(), IDProcess: number(), PercentProcessorTime: number(), WorkingSetPrivate: number() }))
const runningProcessSchema = powerShellList(object({ Id: number(), ProcessName: string(), MainWindowTitle: nullable(string()) }))

/** Lists the busiest processes. CPU is a share of the whole machine, like Task Manager. */
export async function listProcesses(options: { sortBy?: 'memory' | 'cpu', limit?: number } = {}): Promise<ProcessSummary[]> {
  const rows = await queryPowerShellJson(
    'ConvertTo-Json -InputObject @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -ne 0 -and $_.Name -ne \'_Total\' } | Select-Object Name, IDProcess, PercentProcessorTime, WorkingSetPrivate) -Compress',
    perfProcessSchema,
  )
  const cores = Math.max(1, cpus().length)
  const limit = Math.min(MAX_PROCESS_LIST, Math.max(1, options.limit ?? 15))
  const key = options.sortBy === 'cpu' ? 'cpuPercent' : 'memoryMiB'
  return rows
    .map(row => ({
      pid: row.IDProcess,
      // Performance counters add `#2` to repeated names.
      name: row.Name.replace(/#\d+$/, ''),
      cpuPercent: Math.round((row.PercentProcessorTime / cores) * 10) / 10,
      memoryMiB: Math.round(row.WorkingSetPrivate / 1024 / 1024),
    }))
    .sort((left, right) => right[key] - left[key])
    .slice(0, limit)
}

export async function listRunningProcesses(): Promise<ProcessTarget[]> {
  const rows = await queryPowerShellJson(
    'ConvertTo-Json -InputObject @(Get-Process | Select-Object Id, ProcessName, MainWindowTitle) -Compress',
    runningProcessSchema,
  )
  return rows.map(row => ({ pid: row.Id, name: row.ProcessName, windowTitle: row.MainWindowTitle ?? '' }))
}

/**
 * Finds the processes for a close request. A process name match wins. Otherwise the query
 * matches window titles, so "close the YouTube window" can work.
 * Throws when a target is protected or belongs to Shiro.
 */
export function findCloseTargets(
  request: { name?: string, pid?: number },
  processes: ProcessTarget[],
  ownPids: ReadonlySet<number>,
): ProcessTarget[] {
  let targets: ProcessTarget[]
  if (request.pid !== undefined) {
    targets = processes.filter(item => item.pid === request.pid)
  }
  else {
    const query = normalizeAppName(request.name ?? '')
    if (!query)
      throw new Error('Give an app name or a process ID.')
    const processName = PROCESS_ALIASES[query] ?? query.replace(/ exe$/, '').replace(/ /g, '')
    targets = processes.filter(item => item.name.toLowerCase() === processName)
    if (targets.length === 0)
      targets = processes.filter(item => item.windowTitle && normalizeAppName(item.windowTitle).includes(query))
  }

  if (targets.length === 0)
    throw new Error('No running app matches this name. Call process_list to see running apps.')
  const protectedTarget = targets.find(item => isProtectedProcessName(item.name))
  if (protectedTarget)
    throw new Error(`${protectedTarget.name} keeps Windows running, so Shiro does not close it.`)
  if (targets.some(item => ownPids.has(item.pid)))
    throw new Error('Shiro does not close itself.')
  return targets
}

const CLOSE_SCRIPT = String.raw`
$ids = @($env:SHIRO_PIDS -split ',' | ForEach-Object { [int]$_ })
foreach ($process in @(Get-Process -Id $ids -ErrorAction SilentlyContinue)) {
  if ($process.MainWindowHandle -ne [IntPtr]::Zero) { [void]$process.CloseMainWindow() }
}
$deadline = (Get-Date).AddSeconds(4)
while ((Get-Date) -lt $deadline -and @(Get-Process -Id $ids -ErrorAction SilentlyContinue).Count -gt 0) { Start-Sleep -Milliseconds 250 }
if ($env:SHIRO_FORCE -eq '1') {
  Get-Process -Id $ids -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}
ConvertTo-Json -InputObject @(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -Compress
`

/**
 * Asks each window to close, as a click on its X button does, so the app can save its work.
 * With `force`, it then ends the processes that are still running.
 */
export async function closeProcesses(targets: ProcessTarget[], force: boolean) {
  const remaining = new Set(await queryPowerShellJson(
    CLOSE_SCRIPT,
    powerShellList(number()),
    { env: { SHIRO_PIDS: targets.map(item => item.pid).join(','), SHIRO_FORCE: force ? '1' : '0' }, timeoutMs: 15_000 },
  ))
  return {
    closed: targets.filter(item => !remaining.has(item.pid)),
    stillRunning: targets.filter(item => remaining.has(item.pid)),
  }
}
