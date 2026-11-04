import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import HearingStatus from './hearing-status.vue'

import { useSettingsAudioDevice } from '../../../stores/settings/audio-device'

function renderHearingStatus(props: Record<string, unknown>) {
  const pinia = createPinia()
  const screen = render(HearingStatus, {
    props,
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  return { screen, pinia }
}

afterEach(() => {
  localStorage.clear()
})

describe('hearing status while the microphone is off', () => {
  // ROOT CAUSE:
  //
  // The capsule appeared only after the microphone was on, so a new user saw no sign that voice input exists.
  it('shows a microphone-off capsule when the app asks for it', async () => {
    const { screen, pinia } = renderHearingStatus({ showWhenOff: true })
    useSettingsAudioDevice(pinia).enabled = false

    await expect.poll(() => screen.container.textContent).toContain('Microphone is off')
  })

  it('stays hidden by default', async () => {
    const { screen, pinia } = renderHearingStatus({})
    useSettingsAudioDevice(pinia).enabled = false

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.container.textContent).not.toContain('Microphone is off')
  })
})
