<script setup lang="ts">
import { AssistantStatus, HearingStatus } from '@proj-airi/stage-ui/components'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** The current reply. A new command clears it. */
  text: string
  /** Shows how to talk to Shiro while no reply is shown. */
  idleHint?: string
}>()

const { t } = useI18n()
const body = ref<HTMLElement>()

// A long reply grows below the box edge, so the newest line stays in view.
watch(() => props.text, async () => {
  await nextTick()
  body.value?.scrollTo({ top: body.value.scrollHeight })
})
</script>

<template>
  <section
    :aria-label="t('tamagotchi.stage.gaming-reply.label')"
    :class="[
      'h-full w-full flex flex-col gap-1 overflow-hidden',
      'rounded-xl px-3 py-2',
      'bg-neutral-900/75 text-neutral-50 backdrop-blur-md',
    ]"
  >
    <header class="flex shrink-0 items-center gap-2 text-sm">
      <span class="text-primary-300 font-semibold">{{ t('tamagotchi.stage.gaming-reply.name') }}</span>
      <AssistantStatus align="start" />
    </header>
    <div
      ref="body"
      aria-live="polite"
      class="min-h-0 flex-1 overflow-y-auto break-words text-[0.95rem] leading-snug scrollbar-none"
    >
      <p v-if="text.trim()">
        {{ text.trim() }}
      </p>
      <p v-else-if="idleHint" class="text-neutral-400">
        {{ idleHint }}
      </p>
    </div>
    <footer class="shrink-0">
      <HearingStatus align="start" show-when-off />
    </footer>
  </section>
</template>
