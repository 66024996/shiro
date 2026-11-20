import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from './stage-model'

const { initialStageModelId, resetLegacyModelIdentity } = vi.hoisted(() => ({
  initialStageModelId: { value: 'preset-live2d-1' },
  resetLegacyModelIdentity: vi.fn(),
}))

vi.mock('@proj-airi/stage-ui-three', () => ({
  useModelStore: () => ({ resetLegacyModelIdentity }),
}))

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { refManualReset } = await import('@vueuse/core')

  return {
    useLocalStorageManualReset: (key: string, value: string) => refManualReset(
      key === 'settings/stage/model' ? initialStageModelId.value : value,
    ),
  }
})

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...actual,
    useEventListener: vi.fn(),
  }
})

describe('settings stage model store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    initialStageModelId.value = 'preset-live2d-1'
    resetLegacyModelIdentity.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // https://github.com/moeru-ai/airi/issues/1984
  it('issue #1984: falls back to the default preset when a custom stage model is missing', async () => {
    const fallbackModel: DisplayModelURL = {
      id: 'preset-live2d-1',
      format: DisplayModelFormat.Live2dZip,
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
      name: 'Preset Live2D',
      importedAt: 1,
    }

    const displayModelsStore = useDisplayModelsStore()
    const getDisplayModelSpy = vi.spyOn(displayModelsStore, 'getDisplayModel').mockImplementation(async (id) => {
      if (id === 'display-model-missing')
        return undefined
      if (id === fallbackModel.id)
        return fallbackModel
      return undefined
    })

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-missing'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe(fallbackModel.id)
    expect(store.stageModelSelectedDisplayModel).toEqual(fallbackModel)
    expect(store.stageModelSelectedUrl).toBe(fallbackModel.url)
    expect(store.stageModelRenderer).toBe('live2d')
    expect(getDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
    expect(getDisplayModelSpy).toHaveBeenCalledWith(fallbackModel.id)
    expect(resetLegacyModelIdentity).not.toHaveBeenCalled()
  })

  it('routes Tachie archives to the Tachie renderer', async () => {
    const tachieModel: DisplayModelURL = {
      id: 'tachie-model',
      format: DisplayModelFormat.TachieZip,
      type: 'url',
      url: 'https://example.com/character.tachie.zip',
      name: 'Tachie character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(tachieModel)

    vi.stubGlobal('window', {})
    initialStageModelId.value = tachieModel.id
    const store = useSettingsStageModel()

    await store.initializeStageModel()

    expect(store.stageModelSelectedDisplayModel).toEqual(tachieModel)
    expect(store.stageModelSelectedUrl).toBe(tachieModel.url)
    expect(store.stageModelRenderer).toBe('tachie')
    expect(resetLegacyModelIdentity).toHaveBeenCalledOnce()
    expect(resetLegacyModelIdentity).toHaveBeenCalledWith()
  })

  it('resets the legacy model identity before publishing the startup model', async () => {
    const vrmModel: DisplayModelURL = {
      id: 'vrm-model',
      format: DisplayModelFormat.VRM,
      type: 'url',
      url: 'https://example.com/character.vrm',
      name: 'VRM character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(vrmModel)

    vi.stubGlobal('window', {})
    initialStageModelId.value = vrmModel.id
    const store = useSettingsStageModel()

    resetLegacyModelIdentity.mockImplementationOnce(() => {
      expect(store.stageModelRenderer).toBeUndefined()
      expect(store.stageModelSelectedUrl).toBeUndefined()
    })

    await store.initializeStageModel()

    expect(resetLegacyModelIdentity).toHaveBeenCalledWith()
    expect(store.stageModelRenderer).toBe('vrm')
    expect(store.stageModelSelectedUrl).toBe(vrmModel.url)
  })

  it('shows an override model without changing the saved selection, then restores it', async () => {
    const selectedModel: DisplayModelURL = {
      id: 'preset-live2d-1',
      format: DisplayModelFormat.Live2dZip,
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
      name: 'Preset Live2D',
      importedAt: 1,
    }
    const gamingModel: DisplayModelURL = {
      id: 'gaming-avatar',
      format: DisplayModelFormat.TachieZip,
      type: 'url',
      url: 'https://example.com/shiro.tachie.zip',
      name: 'Shiro gaming avatar',
      importedAt: 2,
    }
    const models = new Map([selectedModel, gamingModel].map(model => [model.id, model]))
    vi.spyOn(useDisplayModelsStore(), 'getDisplayModel').mockImplementation(async id => models.get(id))
    const store = useSettingsStageModel()
    await store.initializeStageModel()

    await store.setStageModelOverride('gaming-avatar')

    expect(store.stageModelRenderer).toBe('tachie')
    expect(store.stageModelSelectedUrl).toBe(gamingModel.url)
    expect(store.stageModelSelected).toBe('preset-live2d-1')

    await store.setStageModelOverride(undefined)

    expect(store.stageModelRenderer).toBe('live2d')
    expect(store.stageModelSelectedUrl).toBe(selectedModel.url)
  })

  it('hides the model until it is shown again, also when the model reloads in between', async () => {
    const selectedModel: DisplayModelURL = {
      id: 'preset-live2d-1',
      format: DisplayModelFormat.Live2dZip,
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
      name: 'Preset Live2D',
      importedAt: 1,
    }
    vi.spyOn(useDisplayModelsStore(), 'getDisplayModel').mockImplementation(async id => id === selectedModel.id ? selectedModel : undefined)
    const store = useSettingsStageModel()
    await store.initializeStageModel()

    store.setStageModelHidden(true)
    expect(store.stageModelRenderer).toBe('disabled')

    await store.updateStageModel()
    expect(store.stageModelRenderer).toBe('disabled')
    expect(store.stageModelSelected).toBe('preset-live2d-1')

    store.setStageModelHidden(false)
    expect(store.stageModelRenderer).toBe('live2d')
  })

  it('keeps the saved model when the override model was deleted', async () => {
    const selectedModel: DisplayModelURL = {
      id: 'preset-live2d-1',
      format: DisplayModelFormat.Live2dZip,
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
      name: 'Preset Live2D',
      importedAt: 1,
    }
    vi.spyOn(useDisplayModelsStore(), 'getDisplayModel').mockImplementation(async id => id === selectedModel.id ? selectedModel : undefined)
    const store = useSettingsStageModel()

    await store.setStageModelOverride('deleted-avatar')

    expect(store.stageModelRenderer).toBe('live2d')
    expect(store.stageModelSelected).toBe('preset-live2d-1')
  })
})
