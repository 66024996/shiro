<script setup lang="ts">
import type { IntentHandle } from '@proj-airi/pipelines-audio'

import { getSpeechBusContext, speechOutputSpeakingEvent } from '@proj-airi/stage-ui/services/speech/bus'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { useSpeechRuntimeStore } from '@proj-airi/stage-ui/stores/speech-runtime'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTamagotchiPluginToolsStore } from '../stores/tools/plugins'

/**
 * How long the dialog waits for TTS to start before it tells the user to read the text.
 * Local OmniVoice synthesis on CPU usually starts within a few seconds.
 */
const VOICE_START_TIMEOUT_MS = 10_000

const { t } = useI18n()
const pluginToolsStore = useTamagotchiPluginToolsStore()
const speechRuntimeStore = useSpeechRuntimeStore()
const speechOutputControlStore = useSpeechOutputControlStore()
const { activeCardId } = storeToRefs(useAiriCardStore())

/**
 * Voice prompt lifecycle for the current request.
 *
 * - `waiting`: the intent is queued and no audio has played yet.
 * - `speaking` and `finished`: the speech bus reported playback for this intent.
 * - `muted` and `unavailable`: no audio plays, so the user reads the text instead.
 */
const voiceState = ref<'idle' | 'waiting' | 'speaking' | 'finished' | 'muted' | 'unavailable'>('idle')
const speakingIntentId = ref<string>()
let voiceIntent: IntentHandle | undefined
let voiceStartTimeout: ReturnType<typeof setTimeout> | undefined

const request = computed(() => pluginToolsStore.permissionState === 'permission'
  ? pluginToolsStore.permissionRequest
  : null)
const voiceLine = computed(() => request.value
  ? t('tamagotchi.stage.tool-permission.voice-line', { tool: request.value.toolName })
  : '')
const voiceStatusLabel = computed(() => voiceState.value === 'idle'
  ? ''
  : t(`tamagotchi.stage.tool-permission.voice-status.${voiceState.value}`))

function stopVoice(reason: string) {
  clearTimeout(voiceStartTimeout)
  voiceIntent?.cancel(reason)
  voiceIntent = undefined
}

// The speech bus broadcasts playback for every intent. Only events for this dialog's
// intent change its state. Events from chat replies or older requests are ignored.
const disposeSpeakingListener = getSpeechBusContext().on(speechOutputSpeakingEvent, (event) => {
  const payload = event?.body
  if (!payload || payload.intentId !== speakingIntentId.value)
    return

  if (payload.speaking) {
    clearTimeout(voiceStartTimeout)
    voiceState.value = 'speaking'
  }
  else if (voiceState.value === 'speaking') {
    voiceState.value = 'finished'
    voiceIntent?.end()
    voiceIntent = undefined
  }
  else if (voiceState.value === 'waiting') {
    voiceState.value = 'unavailable'
    stopVoice('permission-voice-not-played')
  }
})

// Each new request cancels the voice of the previous one before it speaks.
watch(() => request.value?.id, () => {
  stopVoice('permission-request-changed')
  speakingIntentId.value = undefined

  const current = request.value
  if (!current) {
    voiceState.value = 'idle'
    return
  }

  if (speechOutputControlStore.speechMuted) {
    voiceState.value = 'muted'
    return
  }

  const intentId = `shiro-permission-${current.id}`
  speakingIntentId.value = intentId
  voiceState.value = 'waiting'
  voiceStartTimeout = setTimeout(() => {
    if (voiceState.value === 'waiting') {
      voiceState.value = 'unavailable'
      stopVoice('permission-voice-timeout')
    }
  }, VOICE_START_TIMEOUT_MS)

  try {
    voiceIntent = speechRuntimeStore.openIntent({
      intentId,
      ownerId: activeCardId.value,
      priority: 'high',
      behavior: 'queue',
    })
    voiceIntent.writeLiteral(voiceLine.value)
    voiceIntent.writeFlush()
  }
  catch (error) {
    stopVoice('permission-voice-error')
    voiceState.value = 'unavailable'
    console.warn('[tool-permission] Failed to speak the permission prompt', error)
  }
}, { immediate: true })

onUnmounted(() => {
  stopVoice('permission-dialog-unmounted')
  disposeSpeakingListener()
})
</script>

<template>
  <div
    v-if="request"
    :class="[
      'tool-permission-backdrop',
      'fixed inset-0 z-[100] p-4',
      'flex items-center justify-center',
      'bg-black/40 backdrop-blur-[2px]',
    ]"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tool-permission-title"
      aria-describedby="tool-permission-reason"
      :class="[
        'tool-permission-panel',
        'relative w-full max-w-lg overflow-hidden p-5',
        'rounded-[28px] border border-primary-200/60 dark:border-primary-800/40',
        'bg-neutral-50 dark:bg-neutral-900',
        'shadow-2xl shadow-primary-900/20',
      ]"
    >
      <div :class="['mb-5 flex items-center gap-3']">
        <div
          :class="[
            'tool-permission-orb',
            'relative size-12 flex shrink-0 items-center justify-center rounded-full',
            'bg-gradient-to-br from-primary-400 to-complementary-400',
            'shadow-lg shadow-primary-500/30',
            voiceState === 'speaking' ? 'is-speaking' : '',
          ]"
        >
          <span :class="['tool-permission-dot', 'absolute size-3 rounded-full bg-primary-200 ring-2 ring-white -right-1 -top-1 dark:ring-neutral-900']" />
          <span :class="['i-solar:shield-check-bold-duotone size-6 text-white']" />
        </div>
        <div>
          <p :class="['text-xs font-medium tracking-wide text-primary-600 dark:text-primary-300']">
            {{ t('tamagotchi.stage.tool-permission.eyebrow') }}
          </p>
          <h3 id="tool-permission-title" :class="['text-xl font-semibold text-neutral-900 dark:text-neutral-50']">
            {{ t('tamagotchi.stage.tool-permission.title') }}
          </h3>
        </div>
      </div>

      <div
        :class="[
          'mb-4 px-4 py-3 rounded-2xl',
          'border border-primary-200 dark:border-primary-800/50',
          'bg-primary-50 dark:bg-primary-950/40',
        ]"
      >
        <div :class="['mb-2 flex items-center justify-between gap-3']">
          <p :class="['text-xs font-medium text-primary-600 dark:text-primary-300']">
            {{ t('tamagotchi.stage.tool-permission.voice-label') }}
          </p>
          <div
            :class="['tool-permission-voice', 'flex items-end gap-1', voiceState === 'speaking' ? 'is-speaking' : '']"
            :aria-label="voiceStatusLabel"
            aria-live="polite"
          >
            <span
              v-for="index in 5"
              :key="index"
              :class="['tool-permission-voice-bar', 'bg-gradient-to-b from-primary-400 to-complementary-400']"
              :style="{ '--i': index - 1 }"
            />
          </div>
        </div>
        <p :class="['mb-1 text-xs text-primary-600/80 dark:text-primary-300/80']" aria-live="polite">
          {{ voiceStatusLabel }}
        </p>
        <p :class="['mt-2 text-base font-medium text-neutral-800 dark:text-neutral-100']">
          {{ voiceLine }}
        </p>
      </div>

      <div
        :class="[
          'mb-5 p-4 rounded-2xl',
          'border border-neutral-200 dark:border-neutral-700',
          'bg-neutral-100 dark:bg-neutral-800/80',
        ]"
      >
        <p :class="['text-xs font-medium text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.stage.tool-permission.tool-label') }}
        </p>
        <div :class="['mt-3 flex items-center gap-3']">
          <span
            :class="[
              'size-10 inline-flex shrink-0 items-center justify-center rounded-xl',
              'bg-gradient-to-br from-primary-500 to-complementary-500 text-white',
            ]"
          >
            <span :class="['i-solar:code-square-bold-duotone size-5']" />
          </span>
          <div>
            <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.stage.tool-permission.tool-name') }}
            </p>
            <p :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-50 break-all']">
              {{ request.toolName }}
            </p>
          </div>
        </div>
      </div>

      <p
        id="tool-permission-reason"
        :class="[
          'mb-5 px-3 py-2 rounded-xl',
          'text-sm leading-relaxed text-neutral-700 dark:text-neutral-200',
          'bg-neutral-100 dark:bg-neutral-800',
        ]"
      >
        {{ t('tamagotchi.stage.tool-permission.reason') }}
      </p>

      <div :class="['flex justify-end gap-2']">
        <Button size="sm" :class="['min-w-[120px]']" @click="pluginToolsStore.cancelPermissionRequest()">
          {{ t('tamagotchi.stage.tool-permission.cancel') }}
        </Button>
        <Button
          size="sm"
          variant="primary"
          color="primary"
          :class="['min-w-[120px]']"
          @click="pluginToolsStore.confirmPermissionRequest(true)"
        >
          {{ t('tamagotchi.stage.tool-permission.allow') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-permission-backdrop {
  animation: tool-permission-fade 180ms ease-out;
}

.tool-permission-panel {
  animation: tool-permission-slide 220ms ease-out;
}

.tool-permission-orb.is-speaking {
  animation: tool-permission-float 2.4s ease-in-out infinite;
}

.tool-permission-orb.is-speaking .tool-permission-dot {
  animation: tool-permission-pulse 2s ease-in-out infinite;
}

.tool-permission-voice {
  height: 20px;
  padding: 0 2px;
}

.tool-permission-voice-bar {
  display: block;
  width: 4px;
  height: 18px;
  border-radius: 9999px;
  transform-origin: center bottom;
  transform: scaleY(0.35);
  opacity: 0.5;
}

.tool-permission-voice.is-speaking .tool-permission-voice-bar {
  animation: tool-permission-voice-bar 1s ease-in-out infinite;
  animation-delay: calc(var(--i) * 120ms);
}

@media (prefers-reduced-motion: reduce) {
  .tool-permission-backdrop,
  .tool-permission-panel,
  .tool-permission-orb.is-speaking,
  .tool-permission-orb.is-speaking .tool-permission-dot,
  .tool-permission-voice.is-speaking .tool-permission-voice-bar {
    animation: none;
  }
}

@keyframes tool-permission-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes tool-permission-slide {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes tool-permission-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes tool-permission-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.8;
  }
}

@keyframes tool-permission-voice-bar {
  0%, 100% {
    transform: scaleY(0.35);
    opacity: 0.7;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
