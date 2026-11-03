import type {} from 'pinia-plugin-synced'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Shiro runtime mode that every window shares.
 *
 * Gaming Mode is runtime state, not a saved preference: each launch starts in normal mode.
 * The stage shows the gaming avatar, and the desktop main window shrinks into a screen corner.
 */
export const useAssistantModeStore = defineStore('assistant-mode', () => {
  const gamingMode = ref(false)

  function setGamingMode(enabled: boolean) {
    gamingMode.value = enabled
  }

  return {
    gamingMode,
    setGamingMode,
  }
}, {
  synced: {
    state: true,
  },
})

/**
 * Saved avatar choices for Gaming Mode.
 *
 * `modelId` is a display-model ID, normally a Tachie PNG set. An empty value keeps the
 * normal stage model during Gaming Mode. localStorage shares the value with other windows.
 */
export const useGamingAvatarSettingsStore = defineStore('gaming-avatar-settings', () => {
  const modelId = useLocalStorageManualReset<string>('settings/shiro/gaming-avatar/model-id', '')

  function resetState() {
    modelId.reset()
  }

  return {
    modelId,
    resetState,
  }
})
