import type { ComputerUseConfig } from './types'

import { describe, expect, it } from 'vitest'

import { evaluateActionPolicy } from './policy'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  executor: 'dry-run',
  permissionChainHint: 'Terminal -> local dry-run',
  denyApps: ['airi'],
  requireAllowedBoundsForMutatingActions: false,
  requireCoordinateAlignmentForMutatingActions: false,
  requireSessionTagForMutatingActions: false,
})

describe('evaluateActionPolicy', () => {
  it('requires approval for mutating ui actions in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'click',
        input: {
          x: 10,
          y: 12,
        },
      },
      config: baseConfig,
      context: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
  })

  // Shiro: `pwd` is now READ_ONLY and runs without approval; approval is required for
  // anything that is not positively known to be read-only.
  it('requires approval for non-read-only terminal execution in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'terminal_exec',
        input: {
          command: 'npm install left-pad',
        },
      },
      config: {
        ...baseConfig,
        approvalMode: 'actions',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
    expect(decision.riskLevel).toBe('high')
  })

  it('skips approval for read-only terminal execution in never mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'terminal_exec',
        input: {
          command: 'pwd',
        },
      },
      config: {
        ...baseConfig,
        approvalMode: 'never',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(false)
    expect(decision.riskLevel).toBe('low')
  })

  it('treats secret env reads as high-risk but non-mutating', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'secret_read_env_value',
        input: {
          filePath: '/workspace/airi/.env',
          keys: ['DISCORD_BOT_TOKEN'],
        },
      },
      config: {
        ...baseConfig,
        approvalMode: 'actions',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
    expect(decision.riskLevel).toBe('high')
  })

  it('denies sensitive foreground apps for ui actions', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'press_keys',
        input: {
          keys: ['command', 'l'],
        },
      },
      config: baseConfig,
      context: {
        available: true,
        appName: 'AIRI',
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('foreground app denied')
  })

  it('denies opening apps outside the configured openable list', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'open_app',
        input: {
          app: 'Safari',
        },
      },
      config: baseConfig,
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('COMPUTER_USE_OPENABLE_APPS')
  })

  it('allows app aliases when the canonical app is configured', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'open_app',
        input: {
          app: 'VS Code',
        },
      },
      config: baseConfig,
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
  })

  it('denies app actions on the legacy linux-x11 executor', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'focus_app',
        input: {
          app: 'Terminal',
        },
      },
      config: {
        ...baseConfig,
        executor: 'linux-x11',
      },
      context: {
        available: false,
        platform: 'linux',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('linux-x11 executor does not support app open/focus actions')
  })

  it('keeps mandatory approval for known-risky terminal commands even in never mode', () => {
    const decision = evaluateActionPolicy({
      action: { kind: 'terminal_exec', input: { command: 'Remove-Item C:\\Users\\me\\old.txt' } },
      config: { ...baseConfig, approvalMode: 'never' },
      context: { available: false, platform: 'win32' },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
  })

  it('denies forbidden terminal commands in every approval mode', () => {
    for (const approvalMode of ['never', 'actions', 'all'] as const) {
      const decision = evaluateActionPolicy({
        action: { kind: 'terminal_exec', input: { command: 'Format-Volume -DriveLetter D' } },
        config: { ...baseConfig, approvalMode },
        context: { available: false, platform: 'win32' },
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      })
      expect(decision.allowed).toBe(false)
    }
  })

  it('lets read-only queries run without approval in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: { kind: 'terminal_exec', input: { command: 'Get-Date' } },
      config: { ...baseConfig, approvalMode: 'actions' },
      context: { available: false, platform: 'win32' },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })
    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(false)
    expect(decision.riskLevel).toBe('low')
  })

  const terminal = (command: string, overrides: Partial<ComputerUseConfig> = {}, cwd?: string) => evaluateActionPolicy({
    action: { kind: 'terminal_exec', input: { command, ...(cwd ? { cwd } : {}) } },
    config: { ...baseConfig, ...overrides },
    context: { available: false, platform: 'win32' },
    operationsExecuted: 0,
    operationUnitsConsumed: 0,
  })

  it('requires approval for UNKNOWN commands even in never mode', () => {
    const decision = terminal('some-unknown-tool', { approvalMode: 'never' })
    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
    expect(decision.terminalRisk?.tier).toBe('unknown')
  })

  it('never lets chaining smuggle a dangerous command past read-only mode', () => {
    for (const mode of ['never', 'actions'] as const) {
      const decision = terminal('Get-Date; Remove-Item C:\\Users\\me\\a.txt', { approvalMode: mode })
      expect(decision.requiresApproval).toBe(true)
    }
  })

  it('attaches the terminal risk assessment to the decision for the audit log', () => {
    const decision = terminal('git reset --hard')
    expect(decision.terminalRisk).toMatchObject({ tier: 'dangerous', decision: 'confirm', level: 'execute' })
    expect(decision.terminalRisk?.categories).toContain('git')
    expect(decision.terminalRisk?.userMessageTh).toContain('git')
  })

  it('enforces the configured terminal access level ceiling', () => {
    expect(terminal('Get-Process', { terminalAccessLevel: 'observe' }).allowed).toBe(true)
    expect(terminal('Start-Process notepad', { terminalAccessLevel: 'observe', openableApps: ['Notepad'] }).allowed).toBe(false)
    expect(terminal('Start-Process notepad', { terminalAccessLevel: 'assist', openableApps: ['Notepad'] }).allowed).toBe(true)
    expect(terminal('Remove-Item a.txt', { terminalAccessLevel: 'assist' }).allowed).toBe(false)
    expect(terminal('Remove-Item a.txt', { terminalAccessLevel: 'execute' }).allowed).toBe(true)
  })

  it('denies working directories outside the allowed list', () => {
    const config = { terminalAllowedCwds: ['/tmp/work'] }
    expect(terminal('pwd', config, '/tmp/work').allowed).toBe(true)
    expect(terminal('pwd', config, '/tmp/work/sub').allowed).toBe(true)
    expect(terminal('pwd', config, '/tmp/work/../etc').allowed).toBe(false)
    expect(terminal('pwd', config, '/etc').allowed).toBe(false)
  })

  it('keeps forbidden commands blocked regardless of approval mode (approval cannot unblock)', () => {
    for (const mode of ['never', 'actions', 'all'] as const) {
      const decision = terminal('powershell -enc SQBFAFgA', { approvalMode: mode })
      expect(decision.allowed).toBe(false)
      expect(decision.terminalRisk?.decision).toBe('block')
    }
  })
})
