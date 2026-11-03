import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { useVisionProcessingStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { storeToRefs } from 'pinia'
import { onMounted, onScopeDispose, watch } from 'vue'

import { electronAssistantActivity } from '../../shared/eventa/assistant-activity'
import { gamingDetectedGameGet, gamingResourcesSet } from '../../shared/eventa/gaming'
import { GameModeAutomation } from '../utils/game-mode-automation'

/**
 * Runs Gaming Mode from the main stage window.
 *
 * - Game detection in the main process turns Gaming Mode on and off, through {@link GameModeAutomation}.
 * - While Gaming Mode is on, the main process unloads the local model and lowers its priority,
 *   and the vision capture loop stops. Voice, speech, the avatar, and commands keep working.
 */
export function useGamingModeRuntime() {
  const assistantMode = useAssistantModeStore()
  const { gamingMode } = storeToRefs(assistantMode)
  const visionProcessing = useVisionProcessingStore()
  const context = useElectronEventaContext()
  const getDetectedGame = useElectronEventaInvoke(gamingDetectedGameGet)
  const setGamingResources = useElectronEventaInvoke(gamingResourcesSet)

  const automation = new GameModeAutomation(() => gamingMode.value, gaming => assistantMode.setGamingMode(gaming))

  const stopActivity = context.value.on(electronAssistantActivity, (event) => {
    if (event?.body?.type === 'game')
      automation.onGameChange(event.body.game)
  })

  watch(gamingMode, (gaming) => {
    automation.onGamingModeChange(gaming)
    if (gaming)
      visionProcessing.stopTicker()
    setGamingResources({ gaming }).catch((error) => {
      console.warn('[gaming-mode] Failed to change resources:', errorMessageFrom(error))
    })
  })

  onMounted(async () => {
    try {
      automation.onGameChange(await getDetectedGame())
    }
    catch (error) {
      console.warn('[gaming-mode] Failed to read the running game:', errorMessageFrom(error))
    }
  })

  onScopeDispose(() => stopActivity?.())
}
