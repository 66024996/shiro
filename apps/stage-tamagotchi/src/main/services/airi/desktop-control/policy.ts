import type { AssistantToolPermission } from '../../../../shared/assistant-runtime'

import { win32 } from 'node:path'

export type DesktopAction
  = | 'system-status'
    | 'process-list'
    | 'app-open'
    | 'app-close'
    | 'web-open'
    | 'file-search'
    | 'file-read'
    | 'file-open'
    | 'file-delete'
    | 'terminal-run'

/**
 * Base permission of each action, from the Shiro specification (section 15).
 * Some requests are stricter than the base level, for example opening an executable file.
 * The `blocked` level comes from the checks below, not from this table.
 */
export const DESKTOP_ACTION_PERMISSIONS: Record<DesktopAction, AssistantToolPermission> = {
  'system-status': 'safe',
  'process-list': 'safe',
  'app-open': 'safe',
  'web-open': 'safe',
  'file-search': 'safe',
  'file-read': 'safe',
  'file-open': 'safe',
  'app-close': 'confirmation',
  'file-delete': 'confirmation',
  'terminal-run': 'confirmation',
}

interface CommandRule {
  pattern: RegExp
  reason: string
}

/**
 * Commands that Shiro never runs, even after confirmation.
 *
 * This list does not make a command safe. Every terminal command still needs confirmation.
 * The list stops commands that destroy data, damage Windows, or turn off security.
 */
const FORBIDDEN_COMMAND_RULES: CommandRule[] = [
  { pattern: /\b(?:format-volume|clear-disk|initialize-disk|remove-partition|diskpart|bcdedit|bootrec|bcdboot)\b/i, reason: 'It changes disks, partitions, or Windows startup.' },
  { pattern: /(?:^|[&|;(]\s*)format(?:\.com)?\s+[a-z]:/i, reason: 'It formats a drive.' },
  { pattern: /\b(?:vssadmin|wbadmin)\b[^&|;]+\b(?:delete|resize)\b|\bshadowcopy\b[^&|;]+\bdelete\b/i, reason: 'It deletes backups or restore points.' },
  { pattern: /\bcipher(?:\.exe)?\s+\/w\b|\bsdelete\b/i, reason: 'It erases data permanently.' },
  { pattern: /\b(?:set-mppreference|add-mppreference)\b/i, reason: 'It changes Microsoft Defender settings.' },
  { pattern: /\bnetsh\b[^&|;]+firewall\b[^&|;]+\b(?:off|disable)\b|\bset-netfirewallprofile\b/i, reason: 'It changes the firewall.' },
  { pattern: /\b(?:sc(?:\.exe)?|stop-service|set-service)\b[^&|;]+\b(?:windefend|wscsvc|mpssvc|securityhealthservice|sense|wdnissvc|bfe)\b/i, reason: 'It stops a security service.' },
  { pattern: /\benablelua\b|\bset-executionpolicy\b/i, reason: 'It changes Windows security settings.' },
  { pattern: /\breg(?:\.exe)?\s+(?:delete|import|restore)\b|\b(?:remove-item|remove-itemproperty|set-itemproperty|new-itemproperty|ri|rp|sp)\b[^&|;]+\bhk(?:lm|ey_local_machine):?/i, reason: 'It changes system registry keys.' },
  { pattern: /\b(?:takeown|icacls|cacls)\b/i, reason: 'It changes file ownership or permissions.' },
  { pattern: /\bnet(?:\.exe)?\s+(?:user|localgroup)\b[^&|;]*\/(?:delete|add)\b|\b(?:remove-localuser|add-localgroupmember|new-localuser)\b/i, reason: 'It changes user accounts.' },
  { pattern: /\b(?:iex|invoke-expression)\b|\bfrombase64string\b|\s-(?:e|ec|enc|encodedcommand)\s/i, reason: 'It runs hidden or downloaded code.' },
  { pattern: /\b(?:start-process|saps|start)\b[^&|;]*-verb\s+runas\b|\brunas(?:\.exe)?\s/i, reason: 'It asks for administrator rights.' },
  {
    // A recursive delete, or a delete aimed at a drive root or a Windows folder.
    pattern: /\b(?:remove-item|rm|ri|del|erase|rd|rmdir)\b[^&|;]*(?:[\s"'][a-z]:\\?(?:[*\s"']|$)|\\(?:windows|program files(?: \(x86\))?|programdata|system volume information)(?:[\\\s"']|$)|\$env:(?:systemroot|windir|programfiles|programdata|systemdrive)\b)/i,
    reason: 'It deletes a drive root or a Windows folder.',
  },
]

/** The longest terminal command that Shiro accepts. Longer commands are hard to review. */
export const MAX_TERMINAL_COMMAND_LENGTH = 2000

/** Returns why a terminal command is forbidden, or `undefined` when it can go to confirmation. */
export function findForbiddenCommandReason(command: string): string | undefined {
  if (command.length > MAX_TERMINAL_COMMAND_LENGTH)
    return `The command is longer than ${MAX_TERMINAL_COMMAND_LENGTH} characters.`
  if (command.includes('\0'))
    return 'The command contains a null character.'
  return FORBIDDEN_COMMAND_RULES.find(rule => rule.pattern.test(command))?.reason
}

/**
 * Processes that keep Windows or its security running. Closing them can crash the session.
 * Names are lowercase and have no `.exe` suffix.
 */
const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'idle',
  'registry',
  'secure system',
  'memory compression',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'lsaiso',
  'svchost',
  'fontdrvhost',
  'dwm',
  'sihost',
  'ctfmon',
  'msmpeng',
  'nissrv',
  'mpdefendercoreservice',
  'securityhealthservice',
  'securityhealthsystray',
  'sgrmbroker',
  'wudfhost',
  'spoolsv',
  'audiodg',
])

export function isProtectedProcessName(name: string) {
  return PROTECTED_PROCESS_NAMES.has(name.toLowerCase().replace(/\.exe$/, ''))
}

/** File types that run code when Windows opens them. Opening one needs confirmation. */
const EXECUTABLE_EXTENSIONS = new Set([
  '.appref-ms',
  '.application',
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.exe',
  '.gadget',
  '.hta',
  '.inf',
  '.jar',
  '.js',
  '.jse',
  '.lnk',
  '.msc',
  '.msi',
  '.msp',
  '.pif',
  '.ps1',
  '.psm1',
  '.reg',
  '.scf',
  '.scr',
  '.sct',
  '.settingcontent-ms',
  '.url',
  '.vbe',
  '.vbs',
  '.ws',
  '.wsf',
  '.wsh',
])

export function isExecutablePath(path: string) {
  return EXECUTABLE_EXTENSIONS.has(win32.extname(path).toLowerCase())
}

/** Folder names that hold keys, tokens, or app data. Shiro never reads or changes them. */
const SENSITIVE_FOLDER_NAMES = new Set(['appdata', '.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config', '$recycle.bin', 'system volume information'])
const SENSITIVE_FILE_PATTERN = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|pfx|p12|ppk|kdbx|keystore|jks)|credentials(?:\..*)?|wallet\.dat|login data|cookies|ntuser\.dat.*)$/i

export interface PathAccessScope {
  /** The user profile folder, for example `C:\Users\name`. */
  homeDir: string
  /** The Windows drive, for example `C:`. */
  systemDrive: string
}

/**
 * Returns why Shiro cannot use a path, or `undefined` when the path is allowed.
 *
 * On the Windows drive, Shiro can use only the user profile. On other drives, it can use
 * every folder. Sensitive folders and key files are always denied. The caller must pass a
 * resolved real path, so a link cannot point outside the allowed folders.
 */
export function findPathAccessDenial(path: string, scope: PathAccessScope): string | undefined {
  const resolved = win32.resolve(path)
  const lower = resolved.toLowerCase()
  const home = win32.resolve(scope.homeDir).toLowerCase()
  const systemDrive = scope.systemDrive.toLowerCase().replace(/\\$/, '')

  if (lower.startsWith('\\\\'))
    return 'Network paths are not allowed.'

  const onSystemDrive = lower.startsWith(`${systemDrive}\\`) || lower === systemDrive
  if (onSystemDrive && lower !== home && !lower.startsWith(`${home}\\`))
    return 'On the Windows drive, Shiro can use only your user folder.'

  const parts = resolved.split('\\').slice(1).filter(Boolean)
  if (parts.some(part => SENSITIVE_FOLDER_NAMES.has(part.toLowerCase())))
    return 'This folder holds app data or keys.'
  const name = parts.at(-1)
  if (name && SENSITIVE_FILE_PATTERN.test(name))
    return 'This file can hold keys or passwords.'
  return undefined
}

/** Returns why a folder cannot be deleted, for example a drive root or the user folder itself. */
export function findDeleteDenial(path: string, scope: PathAccessScope, protectedFolders: string[]): string | undefined {
  const resolved = win32.resolve(path).toLowerCase()
  if (/^[a-z]:\\?$/.test(resolved))
    return 'Shiro does not delete a whole drive.'
  if ([scope.homeDir, ...protectedFolders].some(folder => win32.resolve(folder).toLowerCase() === resolved))
    return 'Shiro does not delete your main user folders.'
  return undefined
}

/**
 * Normalizes a web address. A bare domain gets `https://`. Only http and https are allowed,
 * so the model cannot open `file:`, `javascript:`, or app protocols.
 */
export function normalizeWebUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  }
  catch {
    throw new Error('This is not a valid web address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Only http and https web addresses can be opened.')
  if (url.username || url.password)
    throw new Error('Web addresses with a user name or password are not allowed.')
  return url.toString()
}
