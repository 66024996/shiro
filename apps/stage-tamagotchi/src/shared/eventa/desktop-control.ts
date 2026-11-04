import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Desktop control contracts. The main process validates every request, applies the Shiro
 * permission policy, asks the user when an action needs confirmation, and writes an audit log.
 */

export type SystemStatusSection = 'cpu' | 'memory' | 'gpu' | 'storage' | 'network'

export interface SystemStatusRequest {
  sections?: SystemStatusSection[]
}

export interface SystemStatus {
  time: string
  uptimeHours: number
  cpu?: { model: string, logicalCores: number, usagePercent: number }
  memory?: { totalGiB: number, usedGiB: number, usagePercent: number }
  gpu?: {
    adapters: { name: string, driverVersion: string, memoryGiB: number | null }[]
    /** Highest 3D engine load of any adapter. It is null when Windows has no GPU counters. */
    usagePercent: number | null
    /** Extra details from `nvidia-smi`. A value is null when the driver reports `[N/A]`. */
    nvidia: { name: string, usagePercent: number | null, memoryUsedMiB: number | null, memoryTotalMiB: number | null, temperatureC: number | null }[]
  }
  storage?: { drive: string, label: string, kind: 'fixed' | 'removable' | 'network' | 'other', totalGiB: number, freeGiB: number }[]
  network?: { name: string, description: string, linkSpeed: string, ipv4: string[] }[]
}

export interface ProcessListRequest {
  sortBy?: 'memory' | 'cpu'
  limit?: number
}

export interface ProcessSummary {
  pid: number
  name: string
  cpuPercent: number
  memoryMiB: number
}

export interface AppOpenRequest {
  name: string
  /** The user's latest message. When it names a known app that differs from `name`, that app opens. */
  userText?: string
}

export interface AppCandidate {
  name: string
  appId: string
}

export type AppOpenResult
  = | { status: 'opened', app: AppCandidate }
    | { status: 'ambiguous', candidates: AppCandidate[] }
    | { status: 'not-found', suggestions: AppCandidate[] }

export interface AppCloseRequest {
  /** A process name, an app name, or a window title fragment. */
  name?: string
  pid?: number
  /** Ends the processes that do not close within a few seconds. */
  force?: boolean
}

export interface AppCloseResult {
  closed: ProcessTarget[]
  stillRunning: ProcessTarget[]
}

export interface ProcessTarget {
  pid: number
  name: string
  windowTitle: string
  /**
   * Set for a Microsoft Store app window. ApplicationFrameHost owns the windows of all Store apps,
   * so Shiro closes only this window, never the host process.
   */
  windowHandle?: number
}

export interface WebOpenRequest {
  url: string
}

export interface FileSearchRequest {
  query: string
  /** A folder alias such as `documents`, or an absolute path. Defaults to the main user folders. */
  folder?: string
  limit?: number
}

export interface FileSearchResult {
  matches: { path: string, kind: 'file' | 'folder', sizeBytes: number | null, modified: string }[]
  /** True when the search stopped at a limit before it visited every folder. */
  incomplete: boolean
}

export interface FilePathRequest {
  path: string
}

export interface FileReadRequest {
  path: string
  maxChars?: number
}

export interface FileReadResult {
  path: string
  sizeBytes: number
  text: string
  truncated: boolean
}

export interface TerminalRunRequest {
  shell: 'powershell' | 'cmd'
  command: string
  /** Shown to the user in the confirmation dialog. */
  reason?: string
}

export interface TerminalRunResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export const desktopControlSystemStatus = defineInvokeEventa<SystemStatus, SystemStatusRequest>('eventa:invoke:desktop-control:system-status')
export const desktopControlProcessList = defineInvokeEventa<ProcessSummary[], ProcessListRequest>('eventa:invoke:desktop-control:process-list')
export const desktopControlAppOpen = defineInvokeEventa<AppOpenResult, AppOpenRequest>('eventa:invoke:desktop-control:app-open')
export const desktopControlAppClose = defineInvokeEventa<AppCloseResult, AppCloseRequest>('eventa:invoke:desktop-control:app-close')
export const desktopControlWebOpen = defineInvokeEventa<{ url: string }, WebOpenRequest>('eventa:invoke:desktop-control:web-open')
export const desktopControlFileSearch = defineInvokeEventa<FileSearchResult, FileSearchRequest>('eventa:invoke:desktop-control:file-search')
export const desktopControlFileRead = defineInvokeEventa<FileReadResult, FileReadRequest>('eventa:invoke:desktop-control:file-read')
export const desktopControlFileOpen = defineInvokeEventa<{ path: string }, FilePathRequest>('eventa:invoke:desktop-control:file-open')
export const desktopControlFileDelete = defineInvokeEventa<{ path: string, movedToRecycleBin: true }, FilePathRequest>('eventa:invoke:desktop-control:file-delete')
export const desktopControlTerminalRun = defineInvokeEventa<TerminalRunResult, TerminalRunRequest>('eventa:invoke:desktop-control:terminal-run')
