import base from './base.yaml'
import settings from './settings.yaml'
import stage from './stage.yaml'
import tamagotchi from './tamagotchi'

// NOTICE: Partial locale. Missing keys (most of settings, docs, ...) fall back to `en`
// via vue-i18n `fallbackLocale`. Translate incrementally; see Shiro Phase 1 plan.
export default {
  base,
  settings,
  stage,
  tamagotchi,
}
