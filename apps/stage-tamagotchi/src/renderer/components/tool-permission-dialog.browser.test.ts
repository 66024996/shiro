import { resetElectronEventaContextForTesting } from '@proj-airi/electron-vueuse'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import ToolPermissionDialog from './tool-permission-dialog.vue'

import { useTamagotchiPluginToolsStore } from '../stores/tools/plugins'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

beforeEach(() => {
  vi.stubGlobal('electron', {
    ipcRenderer: {
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    },
  })
  onTestFinished(() => resetElectronEventaContextForTesting())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  onTestFinished(() => disposePinia(pinia))

  const i18n = createI18n({
    legacy: false,
    locale: 'th',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      th: {
        tamagotchi: {
          stage: {
            'tool-permission': {
              'voice-line': 'ชิโระขอใช้ {tool} นะคะ',
              'allow': 'อนุญาต',
              'cancel': 'ยกเลิก',
              'voice-status': { muted: 'ปิดเสียงอยู่' },
            },
          },
        },
      },
    },
  })

  // Muted speech keeps the test away from TTS. The dialog must still show the voice line.
  useSpeechOutputControlStore().setSpeechMuted(true)
  const store = useTamagotchiPluginToolsStore()
  const screen = render(ToolPermissionDialog, { global: { plugins: [pinia, i18n] } })

  return { screen, store }
}

describe('toolPermissionDialog', () => {
  it('shows the localized voice line with the tool name', async () => {
    const { screen, store } = renderDialog()

    store.permissionRequest = { id: 1, toolName: 'browser.open', resolve: vi.fn() }
    store.permissionState = 'permission'

    await expect.element(screen.getByText('ชิโระขอใช้ browser.open นะคะ')).toBeVisible()
    await expect.element(screen.getByText('ปิดเสียงอยู่', { exact: true })).toBeVisible()
  })

  it('resolves the request as allowed and closes', async () => {
    const { screen, store } = renderDialog()
    const resolve = vi.fn()

    store.permissionRequest = { id: 2, toolName: 'filesystem.read', resolve }
    store.permissionState = 'permission'
    await userEvent.click(screen.getByRole('button', { name: 'อนุญาต' }))

    expect(resolve).toHaveBeenCalledWith(true)
    await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('resolves the request as denied when the user cancels', async () => {
    const { screen, store } = renderDialog()
    const resolve = vi.fn()

    store.permissionRequest = { id: 3, toolName: 'network.fetch', resolve }
    store.permissionState = 'permission'
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))

    expect(resolve).toHaveBeenCalledWith(false)
    await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument()
  })
})
