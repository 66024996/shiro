<script setup lang="ts">
import GamingModeSection from '../../components/settings/gaming-mode-section.vue'
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <GamingModeSection />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.gaming-avatar.title
  descriptionKey: tamagotchi.settings.pages.gaming-avatar.menu-description
  subtitleKey: settings.title
  settingsEntry: true
  order: -1
  icon: i-solar:gamepad-bold-duotone
  stageTransition:
    name: slide
</route>
