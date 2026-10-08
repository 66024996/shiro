import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onMounted } from 'vue'

import { DEFAULT_LANGUAGE } from '../../constants/language'

export const useSettingsGeneral = defineStore('settings-general', () => {
  const language = useLocalStorageManualReset<string>('settings/language', '')
  const streamerMode = useLocalStorageManualReset<boolean>('settings/streamer-mode', false)

  const disableTransitions = useLocalStorageManualReset<boolean>('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorageManualReset<boolean>('settings/use-page-specific-transitions', true)

  const websocketSecureEnabled = useLocalStorageManualReset<boolean>('settings/websocket/secure-enabled', false)

  function getLanguage() {
    let language = localStorage.getItem('settings/language')

    if (!language) {
      // Shiro: first-launch default (upstream used navigator.language)
      language = DEFAULT_LANGUAGE
    }

    return resolveSupportedLocale(language, Object.keys(messages!))
  }

  function resetState() {
    language.reset()
    streamerMode.reset()
    disableTransitions.reset()
    usePageSpecificTransitions.reset()
    websocketSecureEnabled.reset()
  }

  onMounted(() => language.value = getLanguage())

  return {
    language,
    streamerMode,
    disableTransitions,
    usePageSpecificTransitions,
    websocketSecureEnabled,
    getLanguage,
    resetState,
  }
})
