import type { SystemStatus, SystemStatusSection } from '../../../../shared/eventa/desktop-control'

import { cpus, freemem, totalmem, uptime } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

import { array, nullable, number, object, optional, string } from 'valibot'

import { queryPowerShellJson } from './windows-shell'

export const SYSTEM_STATUS_SECTIONS: SystemStatusSection[] = ['cpu', 'memory', 'gpu', 'storage', 'network']

/** How long CPU time is sampled. Windows has no load average, so usage needs two samples. */
const CPU_SAMPLE_MS = 400

const GIB = 1024 ** 3

/**
 * Reads GPU, storage, and network data in one PowerShell process.
 * The sections come from `SHIRO_SECTIONS`, so the script text never changes.
 */
const WINDOWS_STATUS_SCRIPT = String.raw`
$sections = $env:SHIRO_SECTIONS -split ','
$result = [ordered]@{}
function ConvertTo-ShiroNumber($value) {
  $number = 0.0
  if ([double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
  return $null
}
if ($sections -contains 'gpu') {
  # AdapterRAM is a 32-bit value, so it stops at 4 GiB. The driver registry key has the real size.
  $memory = @{}
  Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | ForEach-Object {
    $properties = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($properties.DriverDesc -and $properties.'HardwareInformation.qwMemorySize') { $memory[[string]$properties.DriverDesc] = [double]$properties.'HardwareInformation.qwMemorySize' }
  }
  $adapters = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    $bytes = if ($memory.ContainsKey([string]$_.Name)) { $memory[[string]$_.Name] } elseif ($_.AdapterRAM) { [double]$_.AdapterRAM } else { $null }
    [ordered]@{ name = [string]$_.Name; driverVersion = [string]$_.DriverVersion; memoryBytes = $bytes }
  })
  $usage = $null
  $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*engtype_3D' })
  if ($engines.Count -gt 0) {
    # Engine names look like pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D. Sum per adapter, then take the busiest adapter.
    $usage = ($engines | Group-Object { $_.Name -replace '^pid_\d+_', '' -replace '_eng_.*$', '' } | ForEach-Object { ($_.Group | Measure-Object UtilizationPercentage -Sum).Sum } | Measure-Object -Maximum).Maximum
    $usage = [math]::Min(100, [double]$usage)
  }
  $nvidia = @()
  $smi = @((Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'), (Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($smi) {
    $nvidia = @(& $smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>$null | ForEach-Object {
      $fields = $_ -split ',\s*'
      if ($fields.Count -ge 5) { [ordered]@{ name = $fields[0]; usagePercent = ConvertTo-ShiroNumber $fields[1]; memoryUsedMiB = ConvertTo-ShiroNumber $fields[2]; memoryTotalMiB = ConvertTo-ShiroNumber $fields[3]; temperatureC = ConvertTo-ShiroNumber $fields[4] } }
    })
  }
  $result.gpu = [ordered]@{ adapters = $adapters; usagePercent = $usage; nvidia = $nvidia }
}
if ($sections -contains 'storage') {
  $result.storage = @(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.Size } | ForEach-Object {
    [ordered]@{ drive = [string]$_.DeviceID; label = [string]$_.VolumeName; driveType = [int]$_.DriveType; totalBytes = [double]$_.Size; freeBytes = [double]$_.FreeSpace }
  })
}
if ($sections -contains 'network') {
  $result.network = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object {
    $addresses = @(Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.IPAddress })
    [ordered]@{ name = [string]$_.Name; description = [string]$_.InterfaceDescription; linkSpeed = [string]$_.LinkSpeed; ipv4 = $addresses }
  })
}
ConvertTo-Json -InputObject $result -Depth 6 -Compress
`

const windowsStatusSchema = object({
  gpu: optional(object({
    adapters: array(object({ name: string(), driverVersion: string(), memoryBytes: nullable(number()) })),
    usagePercent: nullable(number()),
    nvidia: array(object({
      name: string(),
      usagePercent: nullable(number()),
      memoryUsedMiB: nullable(number()),
      memoryTotalMiB: nullable(number()),
      temperatureC: nullable(number()),
    })),
  })),
  storage: optional(array(object({ drive: string(), label: string(), driveType: number(), totalBytes: number(), freeBytes: number() }))),
  network: optional(array(object({ name: string(), description: string(), linkSpeed: string(), ipv4: array(string()) }))),
})

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function cpuTimeTotals() {
  return cpus().reduce((totals, cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times
    totals.busy += user + nice + sys + irq
    totals.total += user + nice + sys + irq + idle
    return totals
  }, { busy: 0, total: 0 })
}

async function sampleCpuUsage() {
  const before = cpuTimeTotals()
  await delay(CPU_SAMPLE_MS)
  const after = cpuTimeTotals()
  const total = after.total - before.total
  return total > 0 ? round(((after.busy - before.busy) / total) * 100) : 0
}

function driveKind(driveType: number): 'fixed' | 'removable' | 'network' | 'other' {
  switch (driveType) {
    case 2: return 'removable'
    case 3: return 'fixed'
    case 4: return 'network'
    default: return 'other'
  }
}

/** Reads the requested hardware sections. An empty request reads every section. */
export async function readSystemStatus(sections: SystemStatusSection[] = SYSTEM_STATUS_SECTIONS, now = new Date()): Promise<SystemStatus> {
  const wanted = new Set(sections.length > 0 ? sections : SYSTEM_STATUS_SECTIONS)
  const windowsSections = (['gpu', 'storage', 'network'] as const).filter(section => wanted.has(section))

  const [cpuUsage, windows] = await Promise.all([
    wanted.has('cpu') ? sampleCpuUsage() : Promise.resolve(undefined),
    windowsSections.length > 0
      ? queryPowerShellJson(WINDOWS_STATUS_SCRIPT, windowsStatusSchema, { env: { SHIRO_SECTIONS: windowsSections.join(',') } })
      : Promise.resolve(undefined),
  ])

  const status: SystemStatus = {
    time: now.toString(),
    uptimeHours: round(uptime() / 3600),
  }

  if (cpuUsage !== undefined) {
    const list = cpus()
    status.cpu = { model: list[0]?.model.trim() ?? 'Unknown CPU', logicalCores: list.length, usagePercent: cpuUsage }
  }
  if (wanted.has('memory')) {
    const total = totalmem()
    const used = total - freemem()
    status.memory = { totalGiB: round(total / GIB), usedGiB: round(used / GIB), usagePercent: round((used / total) * 100) }
  }
  if (windows?.gpu) {
    status.gpu = {
      adapters: windows.gpu.adapters.map(adapter => ({
        name: adapter.name,
        driverVersion: adapter.driverVersion,
        memoryGiB: adapter.memoryBytes === null ? null : round(adapter.memoryBytes / GIB),
      })),
      usagePercent: windows.gpu.usagePercent === null ? null : round(windows.gpu.usagePercent),
      nvidia: windows.gpu.nvidia,
    }
  }
  if (windows?.storage) {
    status.storage = windows.storage.map(drive => ({
      drive: drive.drive,
      label: drive.label,
      kind: driveKind(drive.driveType),
      totalGiB: round(drive.totalBytes / GIB),
      freeGiB: round(drive.freeBytes / GIB),
    }))
  }
  if (windows?.network)
    status.network = windows.network

  return status
}
