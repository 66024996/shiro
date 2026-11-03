<script setup lang="ts">
import LocalAiOllamaSection from '../../components/settings/local-ai-ollama-section.vue'
import LocalAiSpeechSection from '../../components/settings/local-ai-speech-section.vue'
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <LocalAiSpeechSection />
    <LocalAiOllamaSection />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.local-ai.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 15
  icon: i-solar:cpu-bolt-bold-duotone
  stageTransition:
    name: slide
</route>
