<script setup lang="ts">
import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { FieldCheckbox } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const assistantMode = useAssistantModeStore()

const gamingMode = computed({
  get: () => assistantMode.gamingMode,
  set: value => assistantMode.setGamingMode(value),
})
</script>

<template>
  <section :class="['flex flex-col gap-4 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-semibold']">
        {{ t('tamagotchi.settings.pages.gaming-avatar.mode.title') }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.gaming-avatar.mode.description') }}
      </p>
    </div>

    <FieldCheckbox
      v-model="gamingMode"
      :label="t('tamagotchi.settings.pages.gaming-avatar.mode.toggle')"
    />
  </section>
</template>
