import type { ShortcutAccelerator, ShortcutRegistrationResult } from '@proj-airi/stage-shared/global-shortcut'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { GlobalShortcutService } from '../electron/global-shortcut'

import { useLogg } from '@guiiai/logg'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'

import { isSafeSpotlightAccelerator } from '../../../shared/spotlight-shortcut'

const VOICE_COMMAND_SHORTCUT_ID = 'voice-command'

/**
 * Ctrl+Alt+Space. Alt+Shift switches the Thai keyboard layout, and Ctrl+Shift+Space is a common editor shortcut.
 */
export const defaultVoiceCommandAccelerator: ShortcutAccelerator = { modifiers: ['ctrl', 'alt'], key: 'Space' }

export interface VoiceCommandShortcut {
  getShortcutAccelerator: () => ShortcutAccelerator
  updateShortcutAccelerator: (accelerator: ShortcutAccelerator | null) => ShortcutRegistrationResult
}

/**
 * Registers the global shortcut that starts a voice command without the wake word.
 * The main window opens the command window when `onTriggered` runs, as the wake word does.
 */
export function setupVoiceCommandShortcut(params: {
  globalShortcut: GlobalShortcutService
  appConfig: Config<typeof globalAppConfigSchema>
  onTriggered: () => void
}): VoiceCommandShortcut {
  const log = useLogg('voice-command-shortcut').useGlobalConfig()

  function getShortcutAccelerator(): ShortcutAccelerator {
    return params.appConfig.get()?.voiceCommandShortcutAccelerator ?? defaultVoiceCommandAccelerator
  }

  function register(accelerator: ShortcutAccelerator) {
    return params.globalShortcut.registerMainShortcut({
      binding: { id: VOICE_COMMAND_SHORTCUT_ID, accelerator, scope: 'global', description: 'Voice command' },
      onTriggered: params.onTriggered,
    })
  }

  function updateShortcutAccelerator(accelerator: ShortcutAccelerator | null): ShortcutRegistrationResult {
    const nextAccelerator = accelerator ?? defaultVoiceCommandAccelerator
    // A global shortcut without a modifier would take a normal key away from every app.
    if (!isSafeSpotlightAccelerator(nextAccelerator))
      return { id: VOICE_COMMAND_SHORTCUT_ID, ok: false, reason: ShortcutFailureReasons.Invalid }

    const registration = register(nextAccelerator)
    if (registration.ok)
      params.appConfig.update({ ...params.appConfig.get(), voiceCommandShortcutAccelerator: nextAccelerator })
    else
      log.warn(`Failed to update the voice command shortcut: ${registration.reason}`)
    return registration
  }

  // Main-owned, so a renderer `unregisterAll` reset keeps it.
  const result = register(getShortcutAccelerator())
  if (!result.ok)
    log.warn(`Failed to register the voice command shortcut: ${result.reason}`)

  return { getShortcutAccelerator, updateShortcutAccelerator }
}
