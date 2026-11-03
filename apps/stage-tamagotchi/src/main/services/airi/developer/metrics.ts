import type { DeveloperMetrics } from '../../../../shared/eventa/developer'

import { cpus } from 'node:os'

import { array, nullable, number, object } from 'valibot'

import { queryPowerShellJson } from '../desktop-control/windows-shell'

/** A process to include in the sample, with a short label. */
export interface ProcessToSample {
  pid: number
  kind: string
}

// One PowerShell run reads the machine totals and the per-process numbers, so a sample costs one process start.
const METRICS_SCRIPT = String.raw`
$ids = @($env:SHIRO_PIDS -split ',' | Where-Object { $_ } | ForEach-Object { [int]$_ })
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
$perf = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids -contains [int]$_.IDProcess })
$gpu = @{}
$vram = @{}
$gpuTotal = 0
$vramTotal = 0
try {
  $samples = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage', '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples
  foreach ($s in $samples) {
    if ($s.InstanceName -notmatch 'pid_(\d+)_') { continue }
    $id = [int]$Matches[1]
    if ($s.Path -like '*utilization percentage') { $gpu[$id] += $s.CookedValue; $gpuTotal += $s.CookedValue }
    else { $vram[$id] += $s.CookedValue; $vramTotal += $s.CookedValue }
  }
} catch {}
$processes = foreach ($id in $ids) {
  $p = $perf | Where-Object { [int]$_.IDProcess -eq $id } | Select-Object -First 1
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $proc) { continue }
  [pscustomobject]@{
    pid = $id
    cpu = if ($p) { [double]$p.PercentProcessorTime } else { 0 }
    ram = [double]$proc.PrivateMemorySize64
    gpu = [double]$gpu[$id]
    vram = [double]$vram[$id]
  }
}
ConvertTo-Json -Depth 4 -Compress -InputObject ([pscustomobject]@{
  cpu = [double]$cpu
  ramTotal = [double]$os.TotalVisibleMemorySize * 1024
  ramFree = [double]$os.FreePhysicalMemory * 1024
  gpu = [math]::Min(100, $gpuTotal)
  vram = $vramTotal
  processes = @($processes)
})
`

const metricsSchema = object({
  cpu: number(),
  ramTotal: number(),
  ramFree: number(),
  gpu: number(),
  vram: number(),
  processes: array(object({ pid: number(), cpu: number(), ram: number(), gpu: number(), vram: nullable(number()) })),
})

const MB = 1024 * 1024

/** Samples the machine and the given processes. CPU per process is shown as a share of all cores, like Task Manager. */
export async function sampleMetrics(processes: ProcessToSample[]): Promise<DeveloperMetrics> {
  const result = await queryPowerShellJson(METRICS_SCRIPT, metricsSchema, {
    env: { SHIRO_PIDS: processes.map(item => item.pid).join(',') },
    timeoutMs: 15_000,
  })
  const cores = Math.max(1, cpus().length)
  const kinds = new Map(processes.map(item => [item.pid, item.kind]))
  return {
    sampledAt: Date.now(),
    system: {
      cpuPercent: Math.round(result.cpu),
      ramUsedMb: Math.round((result.ramTotal - result.ramFree) / MB),
      ramTotalMb: Math.round(result.ramTotal / MB),
      gpuPercent: Math.round(result.gpu * 10) / 10,
      vramUsedMb: Math.round(result.vram / MB),
    },
    processes: result.processes.map(item => ({
      pid: item.pid,
      kind: kinds.get(item.pid) ?? 'unknown',
      cpuPercent: Math.round((item.cpu / cores) * 10) / 10,
      ramMb: Math.round(item.ram / MB),
      gpuPercent: Math.round(item.gpu * 10) / 10,
      vramMb: Math.round((item.vram ?? 0) / MB),
    })),
  }
}
