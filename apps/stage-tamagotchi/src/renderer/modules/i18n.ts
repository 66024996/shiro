import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { DEFAULT_LANGUAGE } from '@proj-airi/stage-ui/constants/language'
import { createI18n } from 'vue-i18n'

function getLocale() {
  let language = localStorage.getItem('settings/language')

  if (!language) {
    // Shiro: first-launch default (upstream used navigator.language)
    language = DEFAULT_LANGUAGE
  }

  return resolveSupportedLocale(language, Object.keys(messages!))
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'en',
  messages,
  // NOTICE: Shiro. The `th` locale is intentionally partial and falls back to `en`, which
  // otherwise logs thousands of "[intlify] Not found ..." warnings and buries real errors.
  // Trade-off: genuinely missing keys are no longer reported either; run the locale
  // coverage check (see docs in the Shiro plan) instead of relying on the console.
  missingWarn: false,
  fallbackWarn: false,
})
