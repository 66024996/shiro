import type { ComputerUseConfig } from '../types'

import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { cwd as processCwd } from 'node:process'

/**
 * Shiro terminal guards: pure helpers (no I/O) shared by the policy layer and the
 * runner, so the same rules are audited and enforced in both places.
 */

export type ShellKind = 'powershell' | 'cmd' | 'posix'

export const DEFAULT_TERMINAL_MAX_TIMEOUT_MS = 60_000

/** Windows PowerShell 5.1 is the baseline; `pwsh` (7+) is accepted but never assumed. */
export function detectShellKind(shellPath: string): ShellKind {
  const base = shellPath.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase().replace(/\.exe$/, '') ?? ''
  if (base === 'powershell' || base === 'pwsh')
    return 'powershell'
  if (base === 'cmd')
    return 'cmd'
  return 'posix'
}

/**
 * Static preamble: UTF-8 console output so Thai text is not garbled by the OEM code
 * page. Wrapped in try/catch because setting the encoding throws when no console is
 * attached. Uses only PowerShell 5.1 syntax. Never contains user input.
 */
export const POWERSHELL_PREAMBLE
  = 'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}; $ProgressPreference = \'SilentlyContinue\'; '

export function buildShellArgs(kind: ShellKind, command: string): { args: string[], windowsVerbatimArguments: boolean } {
  switch (kind) {
    case 'powershell':
      return {
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `${POWERSHELL_PREAMBLE}${command}`],
        windowsVerbatimArguments: false,
      }
    case 'cmd':
      // /d: skip AutoRun, /s + outer quotes: predictable quote handling, /c: run and exit.
      return { args: ['/d', '/s', '/c', `"${command}"`], windowsVerbatimArguments: true }
    default:
      return { args: ['-lc', command], windowsVerbatimArguments: false }
  }
}

const ENV_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'PROGRAMDATA',
  'USERNAME',
  'USERDOMAIN',
  'COMPUTERNAME',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  'PSMODULEPATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'TERM',
  'TZ',
])

const ENV_SECRET_RE = /token|secret|password|passwd|credential|api[_-]?key|private[_-]?key|auth|session|cookie/i

/**
 * Builds the environment handed to terminal commands: allowlist only, minus anything
 * that looks like a secret. Windows env names are case-insensitive, so we compare
 * upper-cased names but preserve the original spelling.
 */
export function buildTerminalEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(source)) {
    if (value == null)
      continue
    const upper = name.toUpperCase()
    const allowed = ENV_ALLOWLIST.has(upper) || upper.startsWith('LC_')
    if (allowed && !ENV_SECRET_RE.test(name))
      result[name] = value
  }
  return result
}

export function clampTerminalTimeout(requested: number | undefined, config: Pick<ComputerUseConfig, 'timeoutMs' | 'terminalMaxTimeoutMs'>): number {
  const max = Math.max(1, config.terminalMaxTimeoutMs ?? DEFAULT_TERMINAL_MAX_TIMEOUT_MS)
  const wanted = requested ?? config.timeoutMs
  return Math.min(Math.max(1, Number.isFinite(wanted) ? wanted : config.timeoutMs), max)
}

export function resolveAllowedCwds(config: Pick<ComputerUseConfig, 'terminalAllowedCwds'>): string[] {
  const configured = config.terminalAllowedCwds?.filter(Boolean) ?? []
  return configured.length > 0 ? configured : [processCwd(), homedir()]
}

function pathApiFor(value: string) {
  return /^[a-z]:[\\/]|^\\\\/i.test(value) ? win32 : posix
}

/**
 * Pure containment check (no symlink resolution; the runner additionally applies
 * `realpath`). Case-insensitive for Windows-style paths.
 */
export function isPathWithin(candidate: string, root: string): boolean {
  const api = pathApiFor(root)
  if (pathApiFor(candidate) !== api)
    return false

  const normalize = (value: string) => {
    const resolved = api.resolve(value)
    return api === win32 ? resolved.toLowerCase() : resolved
  }
  const rel = api.relative(normalize(root), normalize(candidate))
  return rel === '' || (rel.split(/[\\/]/)[0] !== '..' && !api.isAbsolute(rel))
}

export function isCwdAllowed(candidate: string, allowedRoots: string[]): boolean {
  return allowedRoots.some(root => isPathWithin(candidate, root))
}
