import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const windowKeyNames = new Set([
  'ALT+F4',
  'ALT+TAB',
  'CTRL+A',
  'CTRL+C',
  'CTRL+L',
  'CTRL+SHIFT+ESC',
  'CTRL+V',
  'CTRL+W',
  'CTRL+X',
  'CTRL+Z',
  'DELETE',
  'DOWN',
  'END',
  'ENTER',
  'ESC',
  'F5',
  'HOME',
  'LEFT',
  'RIGHT',
  'SHIFT+TAB',
  'SPACE',
  'TAB',
  'UP',
])

interface WindowsComputerUseRequest {
  command: string
  arguments: Record<string, string | number>
  artifactPath?: string
}

interface ParsedCommand {
  request: WindowsComputerUseRequest
  summary: string
  dryRun: boolean
  help?: string
}

/**
 * Runs a bounded set of Windows desktop actions after per-action approval.
 *
 * @param options - Paths and the approval callback from the Electron main process.
 * @param options.scriptPath - Path to the packaged script for allowlisted desktop actions.
 * @param options.storeRoot - Directory for screenshot artifacts that the runtime can read.
 * @param options.approveAction - User approval callback for each desktop action.
 */
export function createWindowsComputerUseExecutor(options: {
  scriptPath: string
  storeRoot: string
  approveAction: (summary: string) => Promise<boolean>
}) {
  const scriptPath = resolve(options.scriptPath)
  const storeRoot = resolve(options.storeRoot)

  async function run(argv: string[]): Promise<ComputerUseResult> {
    const parsed = parseCommand(argv, storeRoot)
    if (parsed.help) {
      return {
        argv,
        exitCode: 0,
        output: parsed.help,
        stderr: '',
      }
    }

    if (parsed.dryRun) {
      return {
        argv,
        exitCode: 0,
        output: {
          command: parsed.request.command,
          dryRun: true,
          summary: parsed.summary,
        },
        stderr: '',
      }
    }

    if (!await options.approveAction(parsed.summary))
      throw new Error('The computer-use action was denied.')

    const systemRoot = process.env.SystemRoot
    if (!systemRoot)
      throw new Error('The Windows system directory is not available.')

    const powershellPath = resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const { stdout, stderr } = await execFileAsync(powershellPath, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      JSON.stringify(parsed.request),
    ], {
      cwd: dirname(scriptPath),
      encoding: 'utf8',
      env: {
        ...process.env,
        SHIRO_COMPUTER_USE_STORE: storeRoot,
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
      windowsHide: true,
    })

    const response = JSON.parse(stdout.trim())
    return {
      argv,
      exitCode: 0,
      output: response,
      stderr,
    }
  }

  return { run }
}

function parseCommand(argv: string[], storeRoot: string): ParsedCommand {
  const command = argv[1]
  const { values, dryRun, help } = parseOptions(argv.slice(2))
  if (help || command === '--help' || command === '-h' || command === 'help')
    return { request: { command: command ?? 'help', arguments: {} }, summary: '', dryRun, help: commandHelp(command) }

  switch (command) {
    case 'window.list':
      rejectUnknownOptions(values, [])
      return createParsedCommand(command, {}, 'Read the list of visible desktop windows.', dryRun)
    case 'display.list':
      rejectUnknownOptions(values, [])
      return createParsedCommand(command, {}, 'Read the connected display names and screen bounds.', dryRun)
    case 'display.capture': {
      rejectUnknownOptions(values, [])
      const artifactPath = join(storeRoot, `capture-${randomUUID()}.png`)
      return createParsedCommand(
        command,
        {},
        'Capture the virtual desktop and save a screenshot for this task.',
        dryRun,
        artifactPath,
      )
    }
    case 'app.activate': {
      rejectUnknownOptions(values, ['window-id'])
      const windowId = requiredValue(values, 'window-id')
      if (!/^[1-9]\d{0,15}$/.test(windowId))
        throw new Error('Use a decimal window ID from window.list.')
      return createParsedCommand(
        command,
        { windowId },
        `Bring window ${windowId} to the foreground.`,
        dryRun,
      )
    }
    case 'input.clickPoint': {
      rejectUnknownOptions(values, ['x', 'y', 'button', 'clicks'])
      const x = integerValue(values, 'x', -32768, 32767)
      const y = integerValue(values, 'y', -32768, 32767)
      const button = optionalValue(values, 'button') ?? 'left'
      if (button !== 'left' && button !== 'middle' && button !== 'right')
        throw new Error('Use left, middle, or right for the click button.')
      const clicks = integerValue(values, 'clicks', 1, 2, 1)
      return createParsedCommand(
        command,
        { x, y, button, clicks },
        `Click at screen position ${x}, ${y} with the ${button} button.`,
        dryRun,
      )
    }
    case 'input.typeText': {
      rejectUnknownOptions(values, ['text'])
      const text = requiredValue(values, 'text')
      if (text.length > 2000 || text.includes('\0'))
        throw new Error('Text input must not exceed 2,000 characters or contain a null character.')
      const preview = text.replace(/[\r\n\t]+/g, ' ')
      return createParsedCommand(
        command,
        { text },
        `Type "${preview}" into the foreground app.`,
        dryRun,
      )
    }
    case 'input.key': {
      rejectUnknownOptions(values, ['key'])
      const key = requiredValue(values, 'key').toUpperCase()
      if (!windowKeyNames.has(key))
        throw new Error('This key or shortcut is not supported.')
      return createParsedCommand(command, { key }, `Press ${key} in the foreground app.`, dryRun)
    }
    case 'input.scroll': {
      rejectUnknownOptions(values, ['x', 'y', 'delta-y', 'delta-x'])
      const x = integerValue(values, 'x', -32768, 32767)
      const y = integerValue(values, 'y', -32768, 32767)
      const deltaY = integerValue(values, 'delta-y', -1200, 1200, 0)
      const deltaX = integerValue(values, 'delta-x', -1200, 1200, 0)
      if (deltaX === 0 && deltaY === 0)
        throw new Error('Set a non-zero delta-y or delta-x value.')
      return createParsedCommand(
        command,
        { x, y, deltaX, deltaY },
        `Scroll at screen position ${x}, ${y} by ${deltaX}, ${deltaY}.`,
        dryRun,
      )
    }
    default:
      throw new Error('This desktop command is not supported on Windows.')
  }
}

function parseOptions(args: string[]) {
  const values = new Map<string, string>()
  let dryRun = false
  let help = false

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--json')
      continue
    if (argument === '--dry-run') {
      dryRun = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (!argument.startsWith('--'))
      throw new Error(`Unexpected argument: ${argument}`)

    const separator = argument.indexOf('=')
    const key = argument.slice(2, separator === -1 ? undefined : separator)
    const value = separator === -1 ? args[++index] : argument.slice(separator + 1)
    if (!key || value === undefined || value.startsWith('--'))
      throw new Error(`Option --${key} requires a value.`)
    if (values.has(key))
      throw new Error(`Option --${key} cannot appear more than once.`)
    values.set(key, value)
  }

  return { values, dryRun, help }
}

function rejectUnknownOptions(values: Map<string, string>, allowed: string[]) {
  const unknown = [...values.keys()].find(key => !allowed.includes(key))
  if (unknown)
    throw new Error(`Option --${unknown} is not valid for this command.`)
}

function requiredValue(values: Map<string, string>, name: string) {
  const value = values.get(name)
  if (value === undefined || value.length === 0)
    throw new Error(`Option --${name} is required.`)
  return value
}

function optionalValue(values: Map<string, string>, name: string) {
  const value = values.get(name)
  if (value === undefined || value.length === 0)
    return undefined
  return value
}

function integerValue(values: Map<string, string>, name: string, minimum: number, maximum: number, fallback?: number) {
  const rawValue = values.get(name)
  if (rawValue === undefined && fallback !== undefined)
    return fallback
  if (rawValue === undefined)
    throw new Error(`Option --${name} is required.`)
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`Option --${name} must be an integer from ${minimum} to ${maximum}.`)
  return value
}

function createParsedCommand(
  command: string,
  arguments_: Record<string, string | number>,
  summary: string,
  dryRun: boolean,
  artifactPath?: string,
): ParsedCommand {
  return {
    request: {
      command,
      arguments: arguments_,
      ...(artifactPath ? { artifactPath } : {}),
    },
    summary,
    dryRun,
  }
}

const windowsCommands: Record<string, string> = {
  'window.list': 'List visible windows. Returns decimal window IDs and titles.',
  'display.list': 'List displays and their screen bounds.',
  'display.capture': 'Capture the virtual desktop. Screenshot coordinates start at the reported screen origin.',
  'app.activate': 'Use --window-id <id> to bring a visible window to the foreground.',
  'input.clickPoint': 'Use --x <pixels> --y <pixels> and optional --button left|middle|right and --clicks 1|2.',
  'input.typeText': 'Use --text <text> to type up to 2,000 characters in the foreground app.',
  'input.key': 'Use --key <shortcut> for a supported key or shortcut.',
  'input.scroll': 'Use --x <pixels> --y <pixels> and --delta-y or --delta-x.',
}

function commandHelp(command: string | undefined) {
  if (command && command !== 'help' && command !== '--help' && command !== '-h')
    return `Windows desktop command: ${command}\n${windowsCommands[command] ?? 'This command is not supported.'}`
  return [
    'Windows desktop commands require approval before each action.',
    ...Object.entries(windowsCommands).map(([name, description]) => `  ${name}: ${description}`),
    'Use --dry-run to validate an action without approval or desktop access.',
  ].join('\n')
}
