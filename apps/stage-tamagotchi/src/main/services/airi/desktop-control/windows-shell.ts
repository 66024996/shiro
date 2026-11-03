import type { GenericSchema, InferOutput } from 'valibot'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { array, parse, pipe, transform, union } from 'valibot'

const execFileAsync = promisify(execFile)

export interface WindowsShellResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface WindowsShellOptions {
  shell: 'powershell' | 'cmd'
  command: string
  cwd?: string
  /** Extra environment variables. Use them to pass data to a fixed script. */
  env?: Record<string, string>
  timeoutMs?: number
  /** Output beyond this length is cut, and a note marks the cut. */
  maxOutputChars?: number
}

/** Makes PowerShell 5.1 print UTF-8, so Thai names and window titles survive. */
const POWERSHELL_PRELUDE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ProgressPreference = \'SilentlyContinue\'; '

function systemExecutable(...parts: string[]) {
  const systemRoot = process.env.SystemRoot
  if (!systemRoot)
    throw new Error('The Windows system directory is not available.')
  return resolve(systemRoot, 'System32', ...parts)
}

function truncate(text: string, maxChars: number) {
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n[Output cut after ${maxChars} characters.]`
    : text
}

function processErrorFields(error: unknown) {
  if (!(error instanceof Error))
    return undefined
  const fields = error as Error & { code?: unknown, killed?: unknown, stdout?: unknown, stderr?: unknown }
  if (typeof fields.stdout !== 'string' || typeof fields.stderr !== 'string')
    return undefined
  return {
    exitCode: typeof fields.code === 'number' ? fields.code : -1,
    killed: fields.killed === true,
    stdout: fields.stdout,
    stderr: fields.stderr,
  }
}

/**
 * Runs one command in Windows PowerShell 5.1 or CMD and returns its output.
 *
 * A nonzero exit code and a timeout are results, not errors. Only a failure to start the
 * shell throws. PowerShell receives the command as `-EncodedCommand`, and CMD receives it
 * through an environment variable, so quotes and Thai text cannot break the process arguments.
 */
export async function runWindowsShell(options: WindowsShellOptions): Promise<WindowsShellResult> {
  const timeout = options.timeoutMs ?? 60_000
  const maxOutputChars = options.maxOutputChars ?? 16_000
  const isPowerShell = options.shell === 'powershell'
  const file = isPowerShell
    ? systemExecutable('WindowsPowerShell', 'v1.0', 'powershell.exe')
    : systemExecutable('cmd.exe')
  const args = isPowerShell
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(POWERSHELL_PRELUDE + options.command, 'utf16le').toString('base64')]
    // NOTICE:
    // CMD prints `?` for Thai unless UTF-8 is active before it parses the command line.
    // An outer CMD runs `chcp 65001`. An inner CMD reads the command by delayed expansion.
    // Tested on Windows 10 19045.
    // Remove when CMD writes UTF-8 to pipes by default.
    : ['/d', '/v:on', '/s', '/c', '"chcp 65001>nul & cmd /d /s /c "!SHIRO_CMD_COMMAND!""']
  const env = isPowerShell
    ? options.env
    : { ...options.env, SHIRO_CMD_COMMAND: options.command }

  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: options.cwd,
      env: env ? { ...process.env, ...env } : undefined,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout,
      windowsHide: true,
      windowsVerbatimArguments: !isPowerShell,
    })
    return { exitCode: 0, stdout: truncate(stdout, maxOutputChars), stderr: truncate(stderr, maxOutputChars), timedOut: false }
  }
  catch (error) {
    const fields = processErrorFields(error)
    if (!fields)
      throw error
    return {
      exitCode: fields.exitCode,
      stdout: truncate(fields.stdout, maxOutputChars),
      stderr: truncate(fields.stderr, maxOutputChars),
      timedOut: fields.killed,
    }
  }
}

/**
 * Runs a fixed PowerShell script that prints JSON, and validates the result.
 * Pass request data through `env`. Do not build the script text from it.
 */
export async function queryPowerShellJson<TSchema extends GenericSchema>(
  script: string,
  schema: TSchema,
  options: { env?: Record<string, string>, timeoutMs?: number } = {},
): Promise<InferOutput<TSchema>> {
  const result = await runWindowsShell({
    shell: 'powershell',
    command: script,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 20_000,
    maxOutputChars: 4 * 1024 * 1024,
  })
  if (result.timedOut)
    throw new Error('The Windows query timed out.')
  if (result.exitCode !== 0)
    throw new Error(`The Windows query failed: ${result.stderr.trim() || `exit code ${result.exitCode}`}`)
  const text = result.stdout.trim()
  return parse(schema, text ? JSON.parse(text) : null)
}

/**
 * Accepts one JSON item or an array of items. `ConvertTo-Json` prints a one-item list
 * without brackets in some cases, so list queries need both forms.
 */
export function powerShellList<TSchema extends GenericSchema>(item: TSchema) {
  return pipe(
    union([array(item), item]),
    transform((value): InferOutput<TSchema>[] => (Array.isArray(value) ? value : [value])),
  )
}
