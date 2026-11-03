import type {
  AppCloseRequest,
  AppCloseResult,
  AppOpenRequest,
  AppOpenResult,
  FilePathRequest,
  FileReadRequest,
  FileReadResult,
  FileSearchRequest,
  FileSearchResult,
  ProcessListRequest,
  ProcessSummary,
  ProcessTarget,
  SystemStatus,
  SystemStatusRequest,
  TerminalRunRequest,
  TerminalRunResult,
  WebOpenRequest,
} from '../../../../shared/eventa/desktop-control'
import type { RequestUserApproval } from '../user-approval'
import type { StartAppCatalog } from './app-catalog'
import type { AuditDecision, AuditLog } from './audit-log'
import type { FileAccess } from './files'
import type { DesktopAction } from './policy'

import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import { array, boolean, integer, maxLength, maxValue, minLength, minValue, number, object, optional, parse, picklist, pipe, string, trim } from 'valibot'

import { DESKTOP_ACTION_PERMISSIONS, findForbiddenCommandReason, isExecutablePath, MAX_TERMINAL_COMMAND_LENGTH, normalizeWebUrl } from './policy'
import { closeProcesses, findCloseTargets, listProcesses, listRunningProcesses } from './processes'
import { readSystemStatus, SYSTEM_STATUS_SECTIONS } from './system-status'
import { runWindowsShell } from './windows-shell'

/** Shell functions from Electron. They are passed in, so tests do not open real windows. */
export interface DesktopShell {
  openExternal: (url: string) => Promise<void>
  /** Resolves to an error message, or an empty string on success. */
  openPath: (path: string) => Promise<string>
  trashItem: (path: string) => Promise<void>
}

export interface DesktopControlServiceOptions {
  approve: RequestUserApproval
  auditLog: AuditLog
  files: FileAccess
  apps: StartAppCatalog
  shell: DesktopShell
  /** Process IDs of Shiro itself. Shiro never closes them. */
  ownPids: () => ReadonlySet<number>
  /** Working folder for terminal commands. */
  homeDir: string
  platform?: NodeJS.Platform
}

/** What an action does after its checks pass. */
interface ActionPlan<T> {
  /** The audit summary. It replaces the request summary when the plan knows more, for example a real path. */
  summary?: string
  /** A confirmation question. Actions with the `confirmation` level always ask. */
  confirm?: { message: string, detail?: string }
  run: () => Promise<T>
}

const APPROVAL_TITLE = 'Shiro desktop control | ชิโระขอใช้งานคอมพิวเตอร์'
const APPROVAL_FOOTER = 'This approval applies only to this action.\nการอนุมัตินี้ใช้กับรายการนี้ครั้งเดียว'
const TERMINAL_TIMEOUT_MS = 60_000

const nameText = pipe(string(), trim(), minLength(1), maxLength(200))
const pathText = pipe(string(), trim(), minLength(1), maxLength(1000))
const systemStatusSchema = object({ sections: optional(pipe(array(picklist(SYSTEM_STATUS_SECTIONS)), maxLength(SYSTEM_STATUS_SECTIONS.length))) })
const processListSchema = object({ sortBy: optional(picklist(['memory', 'cpu'])), limit: optional(pipe(number(), integer(), minValue(1), maxValue(50))) })
const appOpenSchema = object({ name: nameText })
const appCloseSchema = object({ name: optional(nameText), pid: optional(pipe(number(), integer(), minValue(1))), force: optional(boolean()) })
const webOpenSchema = object({ url: pipe(string(), trim(), minLength(1), maxLength(2048)) })
const fileSearchSchema = object({ query: nameText, folder: optional(pathText), limit: optional(pipe(number(), integer(), minValue(1), maxValue(50))) })
const filePathSchema = object({ path: pathText })
const fileReadSchema = object({ path: pathText, maxChars: optional(pipe(number(), integer(), minValue(1), maxValue(20_000))) })
const terminalRunSchema = object({
  shell: picklist(['powershell', 'cmd']),
  command: pipe(string(), trim(), minLength(1), maxLength(MAX_TERMINAL_COMMAND_LENGTH)),
  reason: optional(pipe(string(), trim(), maxLength(300))),
})

/**
 * Runs Shiro's computer-control actions in the main process.
 *
 * Each action follows the same order: validate the request, apply the policy, ask the user
 * when the action needs confirmation, run it, and write one audit entry. A policy refusal is
 * logged as `blocked` and never reaches the confirmation dialog.
 */
export class DesktopControlService {
  constructor(private readonly options: DesktopControlServiceOptions) {}

  systemStatus(request: SystemStatusRequest): Promise<SystemStatus> {
    const { sections } = parse(systemStatusSchema, request ?? {})
    return this.perform('system-status', `Read system status: ${(sections ?? ['all']).join(', ')}`, async () => ({
      run: () => readSystemStatus(sections),
    }))
  }

  processList(request: ProcessListRequest): Promise<ProcessSummary[]> {
    const parsed = parse(processListSchema, request ?? {})
    return this.perform('process-list', `List processes by ${parsed.sortBy ?? 'memory'}`, async () => ({
      run: () => listProcesses(parsed),
    }))
  }

  appOpen(request: AppOpenRequest): Promise<AppOpenResult> {
    const { name } = parse(appOpenSchema, request)
    return this.perform('app-open', `Open app "${name}"`, async () => ({
      run: () => this.options.apps.open(name),
    }))
  }

  appClose(request: AppCloseRequest): Promise<AppCloseResult> {
    const parsed = parse(appCloseSchema, request)
    const requested = parsed.pid === undefined ? `"${parsed.name ?? ''}"` : `process ${parsed.pid}`
    return this.perform('app-close', `Close ${requested}${parsed.force ? ' (force)' : ''}`, async () => {
      const targets = findCloseTargets(parsed, await listRunningProcesses(), this.options.ownPids())
      // A Store app window belongs to the shared ApplicationFrameHost process, so its title names the app.
      const label = (target: ProcessTarget) => target.windowHandle === undefined ? target.name : target.windowTitle
      const names = [...new Set(targets.map(label))].join(', ')
      const count = targets.every(target => target.windowHandle !== undefined)
        ? `${targets.length} window${targets.length === 1 ? '' : 's'}`
        : `${targets.length} process${targets.length === 1 ? '' : 'es'}`
      const summary = `Close ${names} (${count})${parsed.force ? ' with force' : ''}`
      const list = targets.slice(0, 10).map(target => target.windowHandle === undefined
        ? `- ${target.name} (PID ${target.pid})${target.windowTitle ? `: ${target.windowTitle}` : ''}`
        : `- ${target.windowTitle} (Microsoft Store app window)`)
      return {
        summary,
        confirm: {
          message: `${summary}\nปิด ${names}`,
          detail: [
            ...list,
            ...(targets.length > 10 ? [`- and ${targets.length - 10} more`] : []),
            '',
            parsed.force
              ? 'Shiro ends the app if it does not close in a few seconds. Unsaved work can be lost.\nถ้าโปรแกรมไม่ปิดเอง ชิโระจะบังคับปิด งานที่ยังไม่บันทึกอาจหาย'
              : 'Shiro asks the app to close, so it can save its work.\nชิโระจะขอให้โปรแกรมปิดตัวเอง โปรแกรมจึงบันทึกงานได้',
          ].join('\n'),
        },
        run: () => closeProcesses(targets, parsed.force ?? false),
      }
    })
  }

  webOpen(request: WebOpenRequest): Promise<{ url: string }> {
    const { url } = parse(webOpenSchema, request)
    return this.perform('web-open', `Open web address ${url}`, async () => {
      const normalized = normalizeWebUrl(url)
      return {
        summary: `Open web address ${normalized}`,
        run: async () => {
          await this.options.shell.openExternal(normalized)
          return { url: normalized }
        },
      }
    })
  }

  fileSearch(request: FileSearchRequest): Promise<FileSearchResult> {
    const parsed = parse(fileSearchSchema, request)
    return this.perform('file-search', `Search files for "${parsed.query}" in ${parsed.folder ?? 'user folders'}`, async () => {
      const folder = parsed.folder === undefined ? undefined : await this.options.files.resolve(parsed.folder)
      return { run: () => this.options.files.search(parsed.query, { folder, limit: parsed.limit }) }
    })
  }

  fileRead(request: FileReadRequest): Promise<FileReadResult> {
    const parsed = parse(fileReadSchema, request)
    return this.perform('file-read', `Read file ${parsed.path}`, async () => {
      const path = await this.options.files.resolve(parsed.path)
      return { summary: `Read file ${path}`, run: () => this.options.files.readText(path, parsed.maxChars) }
    })
  }

  fileOpen(request: FilePathRequest): Promise<{ path: string }> {
    const parsed = parse(filePathSchema, request)
    return this.perform('file-open', `Open file ${parsed.path}`, async () => {
      const path = await this.options.files.resolve(parsed.path)
      return {
        summary: `Open file ${path}`,
        // Opening a program or script runs code, so it needs confirmation like a terminal command.
        confirm: isExecutablePath(path)
          ? { message: `Open this program or script?\nเปิดโปรแกรมหรือสคริปต์นี้ไหม`, detail: `${path}\n\nOpening it runs code on this computer.\nการเปิดไฟล์นี้จะรันโค้ดบนเครื่อง` }
          : undefined,
        run: async () => {
          const error = await this.options.shell.openPath(path)
          if (error)
            throw new Error(error)
          return { path }
        },
      }
    })
  }

  fileDelete(request: FilePathRequest): Promise<{ path: string, movedToRecycleBin: true }> {
    const parsed = parse(filePathSchema, request)
    return this.perform('file-delete', `Delete ${parsed.path}`, async () => {
      const path = await this.options.files.resolve(parsed.path)
      this.options.files.assertDeletable(path)
      return {
        summary: `Move ${path} to the Recycle Bin`,
        confirm: {
          message: 'Move this item to the Recycle Bin?\nย้ายรายการนี้ไปถังขยะไหม',
          detail: `${path}\n\nYou can restore it from the Recycle Bin.\nกู้คืนได้จากถังขยะ`,
        },
        run: async () => {
          await this.options.shell.trashItem(path)
          return { path, movedToRecycleBin: true as const }
        },
      }
    })
  }

  terminalRun(request: TerminalRunRequest): Promise<TerminalRunResult> {
    const parsed = parse(terminalRunSchema, request)
    const shellName = parsed.shell === 'powershell' ? 'PowerShell' : 'CMD'
    return this.perform('terminal-run', `${shellName}: ${parsed.command}`, async () => {
      const forbidden = findForbiddenCommandReason(parsed.command)
      if (forbidden)
        throw new Error(`Shiro does not run this command. ${forbidden}`)
      return {
        confirm: {
          message: `Run this ${shellName} command?\nรันคำสั่ง ${shellName} นี้ไหม`,
          detail: [parsed.command, '', ...(parsed.reason ? [`Reason: ${parsed.reason}`, ''] : []), 'The command runs with your user rights.\nคำสั่งจะรันด้วยสิทธิ์ของผู้ใช้'].join('\n'),
        },
        run: () => runWindowsShell({ shell: parsed.shell, command: parsed.command, cwd: this.options.homeDir, timeoutMs: TERMINAL_TIMEOUT_MS }),
      }
    })
  }

  private async perform<T>(action: DesktopAction, requestSummary: string, plan: () => Promise<ActionPlan<T>>): Promise<T> {
    const audit = (summary: string, decision: AuditDecision, error?: unknown) => this.options.auditLog.write({
      action,
      summary,
      decision,
      ok: error === undefined,
      ...(error === undefined ? {} : { error: errorMessageFrom(error) ?? 'Unknown error' }),
    }).catch(cause => console.warn(`[desktop-control] Failed to write the audit log: ${errorMessageFrom(cause) ?? 'Unknown error'}`))

    let prepared: ActionPlan<T>
    try {
      if ((this.options.platform ?? process.platform) !== 'win32')
        throw new Error('Desktop control works only on Windows.')
      prepared = await plan()
    }
    catch (error) {
      await audit(requestSummary, 'blocked', error)
      throw error
    }

    const summary = prepared.summary ?? requestSummary
    const confirm = prepared.confirm ?? (DESKTOP_ACTION_PERMISSIONS[action] === 'confirmation' ? { message: summary } : undefined)
    let decision: AuditDecision = 'allowed'
    if (confirm) {
      const approved = await this.options.approve({
        title: APPROVAL_TITLE,
        message: confirm.message,
        detail: [confirm.detail, APPROVAL_FOOTER].filter(Boolean).join('\n\n'),
      })
      decision = approved ? 'approved' : 'denied'
      if (!approved) {
        const error = new Error('The user denied this action. Do not try it again unless the user asks.')
        await audit(summary, decision, error)
        throw error
      }
    }

    try {
      const result = await prepared.run()
      await audit(summary, decision)
      return result
    }
    catch (error) {
      await audit(summary, decision, error)
      throw error
    }
  }
}
