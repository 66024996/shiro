<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import LocalAiMemorySection from '../../components/settings/local-ai-memory-section.vue'
import LocalAiOllamaSection from '../../components/settings/local-ai-ollama-section.vue'
import LocalAiSpeechSection from '../../components/settings/local-ai-speech-section.vue'

import { electronShiroSetupOpen } from '../../../shared/eventa'

const { t } = useI18n()
const openSetup = useElectronEventaInvoke(electronShiroSetupOpen)
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <section :class="['flex items-center gap-3 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
      <p :class="['min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-300']">
        {{ t('tamagotchi.settings.pages.local-ai.setup.description') }}
      </p>
      <Button
        :label="t('tamagotchi.settings.pages.local-ai.setup.open')"
        icon="i-solar:magic-stick-3-bold-duotone"
        @click="openSetup()"
      />
    </section>
    <LocalAiSpeechSection />
    <LocalAiOllamaSection />
    <LocalAiMemorySection />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.local-ai.title
  descriptionKey: tamagotchi.settings.pages.local-ai.menu-description
  subtitleKey: settings.title
  settingsEntry: true
  order: -2
  icon: i-solar:cpu-bolt-bold-duotone
  stageTransition:
    name: slide
</route>
