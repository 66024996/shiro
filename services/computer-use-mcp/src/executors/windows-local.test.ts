import { describe, expect, it } from 'vitest'

import { escapeSendKeysText, keysToSendKeys, resolveWindowsLaunchTarget, WINDOWS_SCRIPTS } from './windows-local'

describe('windows-local helpers', () => {
  it('maps friendly app names to launchable targets', () => {
    expect(resolveWindowsLaunchTarget('Visual Studio Code')).toBe('code')
    expect(resolveWindowsLaunchTarget('  Google Chrome ')).toBe('chrome')
    expect(resolveWindowsLaunchTarget('Discord')).toBe('Discord')
  })

  it('escapes SendKeys metacharacters so text is typed literally', () => {
    expect(escapeSendKeysText('a+b^c%d~e(f)')).toBe('a{+}b{^}c{%}d{~}e{(}f{)}')
    expect(escapeSendKeysText('x\ny')).toBe('x{ENTER}y')
  })

  it('converts key chords to SendKeys syntax', () => {
    expect(keysToSendKeys(['ctrl', 'shift', 'p'])).toBe('^+(p)')
    expect(keysToSendKeys(['cmd', 'c'])).toBe('^(c)')
    expect(keysToSendKeys(['enter'])).toBe('{ENTER}')
    expect(keysToSendKeys(['alt', 'f4'])).toBe('%({F4})')
    expect(keysToSendKeys(['???'])).toBe('')
  })
})

describe('windows-local scripts: Windows PowerShell 5.1 baseline', () => {
  // Constructs that only exist in PowerShell 7+ must never appear in our scripts,
  // because the target machine may only have powershell.exe 5.1.
  const PS7_ONLY: Array<[RegExp, string]> = [
    [/-AsArray\b/, 'ConvertTo-Json -AsArray'],
    [/\?\?=?/, 'null-coalescing ?? / ??='],
    [/\?\.[\w[]/, 'null-conditional ?.'],
    [/&&|\|\|/, 'pipeline chain operators && ||'],
    [/-Parallel\b/, 'ForEach-Object -Parallel'],
    [/\$PSStyle\b/, '$PSStyle'],
    [/\bGet-Error\b/, 'Get-Error'],
    [/\bConvertFrom-Json\b[^\n]*-AsHashtable/, 'ConvertFrom-Json -AsHashtable'],
    [/-Encoding\s+utf8(?:NoBOM|BOM)/i, 'utf8NoBOM encodings'],
  ]

  for (const [name, script] of Object.entries(WINDOWS_SCRIPTS)) {
    it(`${name} uses no PowerShell 7-only syntax`, () => {
      for (const [re, label] of PS7_ONLY)
        expect(script, `${name}: ${label}`).not.toMatch(re)
    })

    it(`${name} never embeds user-controlled values (only CU_* env vars)`, () => {
      // Values must arrive through $env:CU_*; scripts are static strings.
      expect(script).not.toMatch(/\$\{?(?:input|request|text|app|keys)\b/)
    })
  }
})
