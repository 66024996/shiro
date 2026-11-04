<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useI18n } from 'vue-i18n'

import ShortcutField from '../../../components/settings/shortcut-field.vue'

import {
  electronSpotlightShortcutGet,
  electronSpotlightShortcutSet,
  electronVoiceCommandShortcutGet,
  electronVoiceCommandShortcutSet,
} from '../../../../shared/eventa'

const { t } = useI18n()
const tt = (key: string) => t(`tamagotchi.settings.pages.system.window-shortcuts.${key}`)
const getVoiceCommandShortcut = useElectronEventaInvoke(electronVoiceCommandShortcutGet)
const setVoiceCommandShortcut = useElectronEventaInvoke(electronVoiceCommandShortcutSet)
const getSpotlightShortcut = useElectronEventaInvoke(electronSpotlightShortcutGet)
const setSpotlightShortcut = useElectronEventaInvoke(electronSpotlightShortcutSet)
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <ShortcutField
      :title="tt('voice-command.title')"
      :description="tt('voice-command.description')"
      setting-name="voice_command_shortcut"
      :get-shortcut="getVoiceCommandShortcut"
      :set-shortcut="setVoiceCommandShortcut"
    />
    <ShortcutField
      :title="tt('spotlight.title')"
      :description="tt('spotlight.description')"
      setting-name="spotlight_shortcut"
      :get-shortcut="getSpotlightShortcut"
      :set-shortcut="setSpotlightShortcut"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.system.window-shortcuts.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
