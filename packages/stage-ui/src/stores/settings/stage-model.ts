import type {} from 'pinia-plugin-synced'

import type { DisplayModel } from '../display-models'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset, useEventListener } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'

export type StageModelRenderer = 'live2d' | 'vrm' | 'spine' | 'tachie' | 'mmd' | 'godot' | 'disabled' | undefined
type BuiltInStageModelRenderer = Exclude<StageModelRenderer, 'godot'>

const useStageModelSelectionStore = defineStore('settings-stage-model-selection', () => {
  // Pinia synchronization owns live cross-window state. localStorage only
  // loads and saves the durable model selection.
  const selected = useLocalStorageManualReset<string>('settings/stage/model', 'preset-live2d-1', {
    listenToStorageChanges: false,
  })

  function resetState() {
    selected.reset()
  }

  return {
    selected,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})

export const useSettingsStageModel = defineStore('settings-stage-model', () => {
  const displayModelsStore = useDisplayModelsStore()
  const stageModelSelectionStore = useStageModelSelectionStore()
  const { selected: stageModelSelectedState } = storeToRefs(stageModelSelectionStore)
  let stageModelUpdateSequence = 0
  let legacyModelIdentityResetPromise: Promise<void> | undefined
  const defaultStageModelId = 'preset-live2d-1'
  const stageModelSelected = computed<string>({
    get: () => stageModelSelectedState.value,
    set: (value) => {
      stageModelSelectedState.value = value
    },
  })
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelRenderer = refManualReset<StageModelRenderer>(undefined)
  const stageModelBuiltInRenderer = refManualReset<BuiltInStageModelRenderer>(undefined)

  const stageViewControlsEnabled = refManualReset<boolean>(false)
  /**
   * Display model shown instead of the saved selection, for example Shiro's PNG avatar in
   * Gaming Mode. It is runtime state: the saved selection and the model settings never change.
   */
  const stageModelOverrideId = ref<string>()

  function revokeStageModelUrl(url?: string) {
    if (url?.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }

  function replaceStageModelUrl(nextUrl?: string) {
    if (stageModelSelectedUrl.value === nextUrl)
      return

    revokeStageModelUrl(stageModelSelectedUrl.value)
    stageModelSelectedUrl.value = nextUrl
  }

  function resolveBuiltInStageModelRenderer(model?: DisplayModel): BuiltInStageModelRenderer {
    if (!model) {
      return 'disabled'
    }

    switch (model.format) {
      case DisplayModelFormat.Live2dZip:
        return 'live2d'
      case DisplayModelFormat.VRM:
        return 'vrm'
      case DisplayModelFormat.SpineZip:
        return 'spine'
      case DisplayModelFormat.TachieZip:
        return 'tachie'
      case DisplayModelFormat.PMXZip:
      case DisplayModelFormat.PMXDirectory:
      case DisplayModelFormat.PMD:
        return 'mmd'
      default:
        return 'disabled'
    }
  }

  function resetLegacyModelIdentity() {
    if (typeof window === 'undefined')
      return undefined

    // The Three.js store is browser-only. Load it only during browser startup so
    // Node consumers of the shared settings store do not evaluate rendering APIs.
    legacyModelIdentityResetPromise ??= import('@proj-airi/stage-ui-three').then(({ useModelStore }) => {
      useModelStore().resetLegacyModelIdentity()
    })

    return legacyModelIdentityResetPromise
  }

  async function updateStageModel() {
    const requestId = ++stageModelUpdateSequence
    const selectedModelId = stageModelSelectedState.value

    const legacyModelIdentityReset = resetLegacyModelIdentity()
    if (legacyModelIdentityReset) {
      await legacyModelIdentityReset
      if (requestId !== stageModelUpdateSequence)
        return
    }

    if (!selectedModelId) {
      replaceStageModelUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelBuiltInRenderer.value = 'disabled'
      if (stageModelRenderer.value !== 'godot')
        stageModelRenderer.value = 'disabled'
      return
    }

    const overrideModelId = stageModelOverrideId.value
    if (overrideModelId) {
      const overrideModel = await displayModelsStore.getDisplayModel(overrideModelId)
      if (requestId !== stageModelUpdateSequence)
        return

      // A deleted override model is not an error. The stage keeps showing the saved selection.
      if (overrideModel) {
        showDisplayModel(overrideModel, requestId)
        return
      }
    }

    const model = await displayModelsStore.getDisplayModel(selectedModelId)
    if (requestId !== stageModelUpdateSequence)
      return

    if (!model) {
      if (selectedModelId !== defaultStageModelId) {
        stageModelSelectedState.value = defaultStageModelId
        await updateStageModel()
        return
      }

      replaceStageModelUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelBuiltInRenderer.value = 'disabled'
      if (stageModelRenderer.value !== 'godot')
        stageModelRenderer.value = 'disabled'
      return
    }

    showDisplayModel(model, requestId)
  }

  function showDisplayModel(model: DisplayModel, requestId: number) {
    let nextUrl: string
    if (model.type === 'file') {
      nextUrl = URL.createObjectURL(model.file)
      if (requestId !== stageModelUpdateSequence) {
        URL.revokeObjectURL(nextUrl)
        return
      }
    }
    else {
      nextUrl = model.url
    }

    const builtInRenderer = resolveBuiltInStageModelRenderer(model)

    // Browser startup consumes the one-time legacy reset before these refs publish.
    // Direct ThreeScene routes mount from the refs and cannot start with stale identity state.
    stageModelBuiltInRenderer.value = builtInRenderer
    if (stageModelRenderer.value !== 'godot')
      stageModelRenderer.value = builtInRenderer
    replaceStageModelUrl(nextUrl)
    stageModelSelectedDisplayModel.value = model
  }

  /** Shows another display model until the override is cleared with `undefined`. */
  async function setStageModelOverride(modelId: string | undefined) {
    if (stageModelOverrideId.value === modelId)
      return

    stageModelOverrideId.value = modelId
    await updateStageModel()
  }

  function setStageModelRenderer(renderer: StageModelRenderer) {
    stageModelRenderer.value = renderer
  }

  function restoreBuiltInStageModelRenderer() {
    stageModelRenderer.value = stageModelBuiltInRenderer.value ?? 'disabled'
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  useEventListener('unload', () => {
    revokeStageModelUrl(stageModelSelectedUrl.value)
  })

  watch(stageModelSelectedState, (_newValue, _oldValue) => {
    void updateStageModel()
  })

  async function resetState() {
    revokeStageModelUrl(stageModelSelectedUrl.value)

    stageModelSelectionStore.resetState()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelRenderer.reset()
    stageModelBuiltInRenderer.reset()
    stageViewControlsEnabled.reset()

    await updateStageModel()
  }

  return {
    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedDisplayModel,
    stageViewControlsEnabled,
    stageModelOverrideId,

    initializeStageModel,
    restoreBuiltInStageModelRenderer,
    setStageModelOverride,
    setStageModelRenderer,
    updateStageModel,
    resetState,
  }
})
