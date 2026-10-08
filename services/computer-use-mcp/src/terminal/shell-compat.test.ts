import { execFileSync } from 'node:child_process'
import { cwd, env, platform } from 'node:process'

import { describe, expect, it } from 'vitest'

import { WINDOWS_SCRIPTS } from '../executors/windows-local'
import { createTestConfig } from '../test-fixtures'
import { POWERSHELL_PREAMBLE } from './guards'
import { createLocalShellRunner } from './runner'

/**
 * Shell compatibility matrix. Each block detects its own environment first and is
 * skipped (with the reason in the title) when the shell is not available, so the
 * suite stays green on hosts that do not have it but runs fully on real Windows.
 *
 *   Windows PowerShell 5.1 (powershell.exe)  -> Windows only    (the baseline)
 *   PowerShell 7+ (pwsh)                     -> anywhere pwsh is installed
 *   CMD (cmd.exe)                            -> Windows only
 *
 * Set PWSH_PATH to point at a pwsh binary that is not on PATH.
 */

function probe(file: string, args: string[]): string | undefined {
  try {
    return execFileSync(file, args, { encoding: 'utf8', timeout: 20_000, windowsHide: true }).trim()
  }
  catch {
    return undefined
  }
}

const isWindows = platform === 'win32'
const pwshPath = env.PWSH_PATH?.trim() || 'pwsh'
const pwshMajor = probe(pwshPath, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'])
const ps51Version = isWindows
  ? probe('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'])
  : undefined

const hasPwsh = pwshMajor !== undefined
const hasPs51 = ps51Version?.startsWith('5.1') === true

function shellConfig(shell: string) {
  return createTestConfig({ terminalShell: shell, terminalAllowedCwds: [cwd()], timeoutMs: 30_000 })
}

/** Polls until `pid` no longer exists (signal 0 only probes liveness). */
async function expectProcessReaped(pid: number, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    }
    catch {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`process ${pid} still alive after ${timeoutMs}ms: the process tree was not killed`)
}

/** Shared behaviour every PowerShell flavour must satisfy. */
function powershellContract(getShell: () => string) {
  it('runs a simple command and reports exit code 0', async () => {
    const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command: 'Write-Output hello' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello')
  })

  it('propagates a non-zero exit code', async () => {
    const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command: 'exit 3' })
    expect(result.exitCode).toBe(3)
  })

  it('keeps Thai output intact (UTF-8)', async () => {
    const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command: 'Write-Output \'สวัสดีค่ะ\'' })
    expect(result.stdout).toContain('สวัสดีค่ะ')
  })

  it('does not leak secrets from the host environment into commands', async () => {
    env.SHIRO_TEST_API_KEY = 'super-secret-value'
    try {
      const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command: 'Write-Output "[$env:SHIRO_TEST_API_KEY]"' })
      expect(result.stdout).not.toContain('super-secret-value')
    }
    finally {
      delete env.SHIRO_TEST_API_KEY
    }
  })

  it('enforces the timeout', async () => {
    const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command: 'Start-Sleep -Seconds 30', timeoutMs: 1_000 })
    expect(result.timedOut).toBe(true)
  }, 20_000)

  it('kills child processes spawned by the command when it times out', async () => {
    // Windows: exercises `taskkill /T /F`. POSIX: exercises process-group kill.
    const child = isWindows
      ? '-WindowStyle Hidden -FilePath ping -ArgumentList \'-n\',\'60\',\'127.0.0.1\''
      : '-FilePath sleep -ArgumentList \'60\''
    const command = `$p = Start-Process -PassThru ${child}; Write-Output ('CHILD_PID:' + $p.Id); Start-Sleep -Seconds 30`

    const result = await createLocalShellRunner(shellConfig(getShell())).execute({ command, timeoutMs: 6_000 })

    expect(result.timedOut).toBe(true)
    const match = result.stdout.match(/CHILD_PID:(\d+)/)
    expect(match, `stdout was: ${result.stdout}`).not.toBeNull()
    await expectProcessReaped(Number(match![1]))
  }, 30_000)

  it('refuses a working directory outside the allowed list', async () => {
    const runner = createLocalShellRunner(createTestConfig({ terminalShell: getShell(), terminalAllowedCwds: [cwd()] }))
    await expect(runner.execute({ command: 'Write-Output x', cwd: isWindows ? 'C:\\Windows' : '/etc' })).rejects.toThrow(/not allowed/)
  })
}

describe.skipIf(!hasPs51)(`Windows PowerShell 5.1 (baseline)${hasPs51 ? '' : ' [skipped: needs Windows with powershell.exe 5.1]'}`, () => {
  powershellContract(() => 'powershell.exe')

  it('is really 5.1', () => {
    expect(ps51Version).toMatch(/^5\.1/)
  })
})

describe.skipIf(!hasPwsh)(`PowerShell 7 (optional)${hasPwsh ? '' : ' [skipped: pwsh not found; set PWSH_PATH]'}`, () => {
  powershellContract(() => pwshPath)

  it('parses every Windows script and the shell preamble without syntax errors', () => {
    const scripts = { ...WINDOWS_SCRIPTS, preamble: `${POWERSHELL_PREAMBLE}Get-Date` }
    const check = `
      $scripts = [Console]::In.ReadToEnd() | ConvertFrom-Json
      $bad = @()
      foreach ($p in $scripts.PSObject.Properties) {
        $errs = $null; $tokens = $null
        [void][System.Management.Automation.Language.Parser]::ParseInput($p.Value, [ref]$tokens, [ref]$errs)
        if ($errs.Count -gt 0) { $bad += ($p.Name + ': ' + $errs[0].Message) }
      }
      if ($bad.Count -gt 0) { Write-Output ($bad -join '; ') ; exit 1 } else { Write-Output 'OK' }
    `
    const output = execFileSync(pwshPath, ['-NoProfile', '-NonInteractive', '-Command', check], {
      input: JSON.stringify(scripts),
      encoding: 'utf8',
      timeout: 30_000,
    }).trim()
    expect(output).toBe('OK')
  })
})

describe.skipIf(!isWindows)(`CMD${isWindows ? '' : ' [skipped: needs Windows]'}`, () => {
  const config = () => shellConfig('cmd.exe')

  it('runs a command and reports exit code', async () => {
    const result = await createLocalShellRunner(config()).execute({ command: 'echo hello' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello')
  })

  it('propagates a non-zero exit code', async () => {
    const result = await createLocalShellRunner(config()).execute({ command: 'exit /b 3' })
    expect(result.exitCode).toBe(3)
  })
})

describe('shell compatibility environment report', () => {
  it('records which shells were available for this run', () => {
    // Not an assertion about the machine: documents what actually ran so a green
    // run on a box without Windows is not mistaken for Windows coverage.
    const report = { platform, ps51: hasPs51 ? ps51Version : 'unavailable', pwsh: hasPwsh ? pwshMajor : 'unavailable', cmd: isWindows ? 'available' : 'unavailable' }

    console.info('[shell-compat]', JSON.stringify(report))
    expect(report.platform).toBe(platform)
  })
})
