import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { electronMainWindowCompactSet } from '../../shared/eventa'

/**
 * Applies Gaming Mode to the main stage window.
 *
 * - The stage hides the model. The Live2D or VRM scene unmounts, so its GPU work and memory stop while a game runs.
 * - The main window becomes a small reply box in the top-left screen corner, and returns when Gaming Mode ends.
 *
 * Call it once from the main stage window. Other windows keep the model, so the model
 * settings page still shows the user's real selection.
 */
export function useGamingAvatarRuntime() {
  const { gamingMode } = storeToRefs(useAssistantModeStore())
  const stageModel = useSettingsStageModel()
  const setMainWindowCompact = useElectronEventaInvoke(electronMainWindowCompactSet)

  watch(gamingMode, gaming => stageModel.setStageModelHidden(gaming), { immediate: true })

  watch(gamingMode, (gaming) => {
    setMainWindowCompact({ compact: gaming }).catch((error) => {
      console.warn('[gaming-avatar] Failed to move the main window:', errorMessageFrom(error))
    })
  })
}
