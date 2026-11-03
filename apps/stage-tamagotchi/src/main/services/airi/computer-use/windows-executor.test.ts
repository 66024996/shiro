import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWindowsComputerUseExecutor } from './windows-executor'

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}))

describe('windows computer-use executor', () => {
  const approval = vi.fn(async () => false)
  const executor = createWindowsComputerUseExecutor({
    scriptPath: join(tmpdir(), 'windows.ps1'),
    storeRoot: join(tmpdir(), 'computer-use-tests'),
    approveAction: approval,
  })

  beforeEach(() => {
    approval.mockClear()
  })

  it('handles top-level help without requesting approval', async () => {
    const result = await executor.run(['invoke', '--help'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('window.list')
    expect(approval).not.toHaveBeenCalled()
  })

  it('validates dry-run input without approval or desktop access', async () => {
    const result = await executor.run([
      'invoke',
      'input.clickPoint',
      '--x',
      '12',
      '--y',
      '20',
      '--dry-run',
    ])

    expect(result.output).toEqual({
      command: 'input.clickPoint',
      dryRun: true,
      summary: 'Click at screen position 12, 20 with the left button.',
    })
    expect(approval).not.toHaveBeenCalled()
  })

  it('rejects unsupported commands and invalid arguments before approval', async () => {
    await expect(executor.run(['invoke', 'powershell']))
      .rejects
      .toThrow('not supported')
    await expect(executor.run(['invoke', 'window.list', '-Command', 'Get-Process']))
      .rejects
      .toThrow('Unexpected argument: -Command')
    await expect(executor.run(['invoke', 'input.key', '--key', 'CTRL+ALT+DELETE']))
      .rejects
      .toThrow('not supported')

    expect(approval).not.toHaveBeenCalled()
  })

  it('denies an action without starting PowerShell', async () => {
    await expect(executor.run(['invoke', 'window.list']))
      .rejects
      .toThrow('denied')

    expect(approval).toHaveBeenCalledWith('Read the list of visible desktop windows.')
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
