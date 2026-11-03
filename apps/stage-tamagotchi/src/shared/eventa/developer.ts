import { defineInvokeEventa } from '@moeru/eventa'

/** One Shiro process in a metrics sample. CPU is a share of the whole machine. */
export interface DeveloperProcessMetrics {
  pid: number
  /** For example `electron:renderer`, `speech`, or `llm`. */
  kind: string
  cpuPercent: number
  ramMb: number
  gpuPercent: number
  vramMb: number
}

export interface DeveloperMetrics {
  sampledAt: number
  system: {
    cpuPercent: number
    ramUsedMb: number
    ramTotalMb: number
    gpuPercent: number
    vramUsedMb: number
  }
  processes: DeveloperProcessMetrics[]
}

export interface DeveloperActionRecord {
  time: string
  action: string
  summary: string
  decision: string
  ok: boolean
  error?: string
}

/** Samples CPU, RAM, GPU, and VRAM of the machine and of Shiro's processes. A sample takes about 1 second. */
export const developerMetricsGet = defineInvokeEventa<DeveloperMetrics>('eventa:invoke:shiro:developer:metrics:get')
/** The newest main-process log lines, oldest first. */
export const developerLogsGet = defineInvokeEventa<string[]>('eventa:invoke:shiro:developer:logs:get')
/** The newest desktop actions from the audit log, newest first. */
export const developerActionsGet = defineInvokeEventa<DeveloperActionRecord[]>('eventa:invoke:shiro:developer:actions:get')
