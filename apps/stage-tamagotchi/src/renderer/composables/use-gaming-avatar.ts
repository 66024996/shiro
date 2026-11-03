import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAssistantModeStore, useGamingAvatarSettingsStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { electronMainWindowCompactSet } from '../../shared/eventa'

/**
 * Applies Gaming Mode to the main stage window.
 *
 * - The stage shows the gaming avatar instead of the saved model. Switching the renderer
 *   unmounts the Live2D or VRM scene, so the GPU work stops while a game runs.
 * - The main window moves into the bottom-right screen corner, and returns when Gaming Mode ends.
 *
 * Call it once from the main stage window. Other windows keep the saved model, so the model
 * settings page still shows the user's real selection.
 */
export function useGamingAvatarRuntime() {
  const { gamingMode } = storeToRefs(useAssistantModeStore())
  const { modelId } = storeToRefs(useGamingAvatarSettingsStore())
  const stageModel = useSettingsStageModel()
  const setMainWindowCompact = useElectronEventaInvoke(electronMainWindowCompactSet)

  watch([gamingMode, modelId], ([gaming, gamingModelId]) => {
    void stageModel.setStageModelOverride(gaming && gamingModelId ? gamingModelId : undefined)
  }, { immediate: true })

  watch(gamingMode, (gaming) => {
    setMainWindowCompact({ compact: gaming }).catch((error) => {
      console.warn('[gaming-avatar] Failed to move the main window:', errorMessageFrom(error))
    })
  })
}
