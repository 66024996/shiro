import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Shiro runtime mode that every window shares.
 *
 * Gaming Mode is runtime state, not a saved preference: each launch starts in normal mode.
 * The stage hides the character and replies as text. The desktop main window becomes a small box in a screen corner.
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
