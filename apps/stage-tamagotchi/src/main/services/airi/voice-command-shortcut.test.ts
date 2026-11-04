import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { GlobalShortcutService, RegisterMainShortcutParams } from '../electron/global-shortcut'

import { describe, expect, it, vi } from 'vitest'

import { defaultVoiceCommandAccelerator, setupVoiceCommandShortcut } from './voice-command-shortcut'

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({ useGlobalConfig: () => ({ warn: vi.fn() }) }),
}))

function createHarness(options: { stored?: { modifiers: ('ctrl' | 'alt' | 'shift')[], key: string }, fail?: boolean } = {}) {
  const registrations: RegisterMainShortcutParams[] = []
  let config: Record<string, unknown> = options.stored ? { voiceCommandShortcutAccelerator: options.stored } : {}
  const onTriggered = vi.fn()
  const shortcut = setupVoiceCommandShortcut({
    globalShortcut: {
      registerMainShortcut: (params: RegisterMainShortcutParams) => {
        registrations.push(params)
        return options.fail ? { id: params.binding.id, ok: false as const, reason: 'conflict' as const } : { id: params.binding.id, ok: true as const }
      },
    } as unknown as GlobalShortcutService,
    appConfig: {
      get: () => config,
      update: (next: Record<string, unknown>) => {
        config = next
      },
    } as unknown as Config<typeof globalAppConfigSchema>,
    onTriggered,
  })
  return { shortcut, registrations, onTriggered, getConfig: () => config }
}

describe('setupVoiceCommandShortcut', () => {
  it('registers Ctrl+Alt+Space by default and reports presses', () => {
    const { registrations, onTriggered } = createHarness()

    expect(registrations[0]?.binding.accelerator).toEqual(defaultVoiceCommandAccelerator)
    expect(registrations[0]?.binding.scope).toBe('global')
    registrations[0]?.onTriggered()
    expect(onTriggered).toHaveBeenCalledOnce()
  })

  it('uses the saved shortcut', () => {
    const stored = { modifiers: ['ctrl' as const, 'shift' as const], key: 'KeyV' }
    const { shortcut, registrations } = createHarness({ stored })

    expect(registrations[0]?.binding.accelerator).toEqual(stored)
    expect(shortcut.getShortcutAccelerator()).toEqual(stored)
  })

  it('saves a new shortcut only after it registers', () => {
    const next = { modifiers: ['alt' as const], key: 'KeyV' }
    const ok = createHarness()
    expect(ok.shortcut.updateShortcutAccelerator(next).ok).toBe(true)
    expect(ok.getConfig().voiceCommandShortcutAccelerator).toEqual(next)

    const failed = createHarness({ fail: true })
    expect(failed.shortcut.updateShortcutAccelerator(next).ok).toBe(false)
    expect(failed.getConfig().voiceCommandShortcutAccelerator).toBeUndefined()
  })

  it('rejects a shortcut without a modifier', () => {
    const { shortcut, registrations } = createHarness()

    expect(shortcut.updateShortcutAccelerator({ modifiers: ['shift'], key: 'KeyV' }).ok).toBe(false)
    expect(registrations).toHaveLength(1)
  })
})
