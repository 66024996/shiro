import { readTachieZipImages } from '@proj-airi/stage-ui-tachie'
import { useGamingAvatarSettingsStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { DisplayModelFormat, useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { describe, expect, it, onTestFinished } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import GamingAvatarEditor from './gaming-avatar-editor.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

async function createPng(name: string, width: number, height: number, transparent: boolean) {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')!
  if (!transparent) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.fillStyle = '#7c3aed'
  context.fillRect(width / 4, height / 4, width / 2, height / 2)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new File([blob], name, { type: 'image/png' })
}

async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

async function renderEditor() {
  const pinia = createPinia()
  setActivePinia(pinia)
  onTestFinished(() => disposePinia(pinia))

  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        tamagotchi: {
          settings: {
            pages: {
              'gaming-avatar': {
                editor: {
                  'save': 'Save avatar',
                  'opaque-warning': 'Opaque: {emotions}',
                },
                emotions: { happy: 'Happy' },
              },
            },
          },
        },
      },
    },
  })

  const screen = render(GamingAvatarEditor, { global: { plugins: [pinia, i18n] } })
  return { screen }
}

function fileInputOf(screen: Awaited<ReturnType<typeof renderEditor>>['screen'], emotion: string) {
  return screen.getByTestId(`gaming-avatar-slot-${emotion}`).element().querySelector<HTMLInputElement>('input[type="file"]')!
}

describe('gamingAvatarEditor', () => {
  it('keeps saving disabled until a neutral image exists', async () => {
    const { screen } = await renderEditor()

    await userEvent.upload(fileInputOf(screen, 'happy'), await createPng('happy.png', 200, 200, true))

    await expect.element(screen.getByRole('button', { name: 'Save avatar' })).toBeDisabled()
  })

  it('saves a Tachie archive with one canvas size and selects it for Gaming Mode', async () => {
    const { screen } = await renderEditor()

    await userEvent.upload(fileInputOf(screen, 'neutral'), await createPng('idle.png', 300, 400, true))
    await userEvent.upload(fileInputOf(screen, 'happy'), await createPng('smile.png', 600, 400, false))
    await userEvent.click(screen.getByRole('button', { name: 'Save avatar' }))

    await expect.element(screen.getByRole('status')).toHaveTextContent('Opaque: Happy')
    const modelId = useGamingAvatarSettingsStore().modelId
    const model = await useDisplayModelsStore().getDisplayModel(modelId)
    expect(model?.format).toBe(DisplayModelFormat.TachieZip)
    expect(model?.type).toBe('file')

    const images = await readTachieZipImages(model!.type === 'file' ? model!.file : new Blob())
    expect(Object.keys(images).sort()).toEqual(['happy', 'neutral'])
    expect(await imageSize(images.neutral!)).toEqual({ width: 300, height: 400 })
    expect(await imageSize(images.happy!)).toEqual({ width: 300, height: 400 })
  })
})
