import { describe, expect, it } from 'vitest'

import {
  buildShellArgs,
  buildTerminalEnv,
  clampTerminalTimeout,
  detectShellKind,
  isCwdAllowed,
  isPathWithin,
  POWERSHELL_PREAMBLE,
} from './guards'

describe('detectShellKind / buildShellArgs', () => {
  it('detects shells by basename on any platform path style', () => {
    expect(detectShellKind('powershell.exe')).toBe('powershell')
    expect(detectShellKind('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell')
    expect(detectShellKind('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell')
    expect(detectShellKind('C:\\Windows\\System32\\cmd.exe')).toBe('cmd')
    expect(detectShellKind('/bin/zsh')).toBe('posix')
  })

  it('uses PowerShell 5.1-compatible flags (no -lc, non-interactive, no profile)', () => {
    const { args } = buildShellArgs('powershell', 'Get-Date')
    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])
    expect(args[4]).toBe(`${POWERSHELL_PREAMBLE}Get-Date`)
    expect(args).not.toContain('-lc')
  })

  it('keeps cmd and posix argument conventions', () => {
    expect(buildShellArgs('cmd', 'ver')).toEqual({ args: ['/d', '/s', '/c', '"ver"'], windowsVerbatimArguments: true })
    expect(buildShellArgs('posix', 'pwd').args).toEqual(['-lc', 'pwd'])
  })

  it('powerShell preamble uses only 5.1 syntax and no user input', () => {
    expect(POWERSHELL_PREAMBLE).not.toMatch(/\?\?|\?\.|&&|\|\||-AsArray|-Parallel/)
  })
})

describe('buildTerminalEnv', () => {
  it('passes only allowlisted variables and drops secrets', () => {
    const env = buildTerminalEnv({
      PATH: '/usr/bin',
      Path: undefined,
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\me',
      LC_ALL: 'th_TH.UTF-8',
      GITHUB_TOKEN: 'ghp_secret',
      OPENAI_API_KEY: 'sk-secret',
      AWS_SECRET_ACCESS_KEY: 'x',
      MY_PASSWORD: 'x',
      RANDOM_VAR: 'x',
    })
    expect(Object.keys(env).sort()).toEqual(['LC_ALL', 'PATH', 'SystemRoot', 'USERPROFILE'])
  })

  it('matches Windows env names case-insensitively', () => {
    expect(buildTerminalEnv({ Path: 'C:\\x', windir: 'C:\\Windows' })).toEqual({ Path: 'C:\\x', windir: 'C:\\Windows' })
  })
})

describe('clampTerminalTimeout', () => {
  it('defaults to config timeout and never exceeds the cap', () => {
    const config = { timeoutMs: 15_000, terminalMaxTimeoutMs: 60_000 }
    expect(clampTerminalTimeout(undefined, config)).toBe(15_000)
    expect(clampTerminalTimeout(5_000, config)).toBe(5_000)
    expect(clampTerminalTimeout(10 * 60_000, config)).toBe(60_000)
    expect(clampTerminalTimeout(0, config)).toBe(1)
    expect(clampTerminalTimeout(Number.NaN, config)).toBe(15_000)
  })
})

describe('cwd containment', () => {
  it('allows the root and children, rejects siblings and traversal (posix)', () => {
    expect(isPathWithin('/work', '/work')).toBe(true)
    expect(isPathWithin('/work/a/b', '/work')).toBe(true)
    expect(isPathWithin('/workshop', '/work')).toBe(false)
    expect(isPathWithin('/work/../etc', '/work')).toBe(false)
  })

  it('is case-insensitive and separator-agnostic for Windows paths', () => {
    expect(isPathWithin('c:\\users\\me\\proj', 'C:\\Users\\Me')).toBe(true)
    expect(isPathWithin('C:/Users/Me/proj', 'C:\\Users\\Me')).toBe(true)
    expect(isPathWithin('C:\\Users\\Meagan', 'C:\\Users\\Me')).toBe(false)
    expect(isPathWithin('D:\\x', 'C:\\Users\\Me')).toBe(false)
    expect(isPathWithin('C:\\Users\\Me\\..\\Other', 'C:\\Users\\Me')).toBe(false)
  })

  it('checks against any of several roots', () => {
    expect(isCwdAllowed('/b/x', ['/a', '/b'])).toBe(true)
    expect(isCwdAllowed('/c', ['/a', '/b'])).toBe(false)
  })
})
