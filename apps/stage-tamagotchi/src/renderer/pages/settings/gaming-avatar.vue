<script setup lang="ts">
import GamingAvatarEditor from '../../components/settings/gaming-avatar-editor.vue'
import GamingModeSection from '../../components/settings/gaming-mode-section.vue'
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <GamingModeSection />
    <GamingAvatarEditor />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.gaming-avatar.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 16
  icon: i-solar:gamepad-bold-duotone
  stageTransition:
    name: slide
</route>
