<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { Button, useTheme } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import LocalAiOllamaSection from '../components/settings/local-ai-ollama-section.vue'
import LocalAiSpeechSection from '../components/settings/local-ai-speech-section.vue'

import { electronOnboardingClose } from '../../shared/eventa'
import { useVoiceLogStore } from '../stores/voice-log'

/**
 * Shiro's first-run setup. It walks through the local chat model, the offline voice, and a first voice command.
 * The steps reuse the Local AI settings sections, so a later visit to Settings shows the same controls.
 */
const steps = ['welcome', 'brain', 'voice', 'talk', 'done'] as const
type Step = typeof steps[number]

const { t } = useI18n()
const onboardingStore = useOnboardingStore()
const voiceLog = useVoiceLogStore()
const { isDark } = useTheme()
const closeWindow = useElectronEventaInvoke(electronOnboardingClose)

const stepIndex = shallowRef(0)
const step = computed<Step>(() => steps[stepIndex.value]!)
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value === steps.length - 1)
const bgClass = computed(() => isDark.value ? 'bg-[#0f0f0f]' : 'bg-white')

/** The latest speech that the main window heard, newest first, so the user sees each try. */
const heardEntries = computed(() => voiceLog.entries.filter(entry => entry.kind === 'heard' && entry.text).slice(0, 4))

function next() {
  if (!isLast.value)
    stepIndex.value++
}

function back() {
  if (!isFirst.value)
    stepIndex.value--
}

async function skip() {
  onboardingStore.markSetupSkipped()
  await closeWindow()
}

async function finish() {
  onboardingStore.markSetupCompleted()
  await closeWindow()
}
</script>

<template>
  <div :class="['h-full min-h-0 w-full flex flex-col overflow-hidden', bgClass]">
    <div :class="['min-h-8 w-full flex-shrink-0 select-none drag-region', bgClass]" />

    <div :class="['mx-auto mb-6 mt-2 min-h-0 max-w-2xl w-full flex flex-1 flex-col gap-4 px-8']">
      <div :class="['flex items-center gap-2']" role="progressbar" :aria-valuenow="stepIndex + 1" :aria-valuemax="steps.length">
        <span
          v-for="(item, index) in steps"
          :key="item"
          :class="['h-1.5 flex-1 rounded-full transition-colors', index <= stepIndex ? 'bg-primary-500' : 'bg-neutral-200 dark:bg-neutral-800']"
        />
      </div>

      <div :class="['flex flex-col gap-1']">
        <h1 :class="['text-2xl font-semibold']">
          {{ t(`tamagotchi.stage.onboarding.steps.${step}.title`) }}
        </h1>
        <p :class="['text-sm text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ t(`tamagotchi.stage.onboarding.steps.${step}.description`) }}
        </p>
      </div>

      <div :class="['min-h-0 flex-1 overflow-y-auto pb-2']">
        <LocalAiOllamaSection v-if="step === 'brain'" />
        <LocalAiSpeechSection v-else-if="step === 'voice'" />
        <div v-else-if="step === 'talk'" :class="['flex flex-col gap-3']">
          <div :class="['rounded-2xl bg-neutral-100/80 p-4 text-sm leading-relaxed dark:bg-neutral-800/70']">
            <p>{{ t('tamagotchi.stage.onboarding.steps.talk.wake-word') }}</p>
            <p :class="['mt-2']">
              {{ t('tamagotchi.stage.onboarding.steps.talk.shortcut') }}
            </p>
          </div>
          <div :class="['rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
            <h2 :class="['text-sm font-medium']">
              {{ t('tamagotchi.stage.onboarding.steps.talk.heard-title') }}
            </h2>
            <p v-if="heardEntries.length === 0" :class="['mt-2 text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.stage.onboarding.steps.talk.heard-empty') }}
            </p>
            <ul v-else :class="['mt-2 flex flex-col gap-2']">
              <li v-for="entry in heardEntries" :key="entry.id" :class="['flex items-start gap-2 text-sm']">
                <span
                  aria-hidden="true"
                  :class="[
                    'mt-0.5 size-4 shrink-0',
                    entry.detail?.endsWith('ignored') ? 'i-solar:close-circle-bold-duotone text-orange-500' : 'i-solar:check-circle-bold-duotone text-emerald-500',
                  ]"
                />
                <span :class="['min-w-0 break-words']">
                  “{{ entry.text }}”
                  <span :class="['block text-xs text-neutral-500 dark:text-neutral-400']">
                    {{ entry.detail?.endsWith('ignored') ? t('tamagotchi.stage.onboarding.steps.talk.ignored') : t('tamagotchi.stage.onboarding.steps.talk.accepted') }}
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div :class="['flex items-center gap-2']">
        <Button v-if="!isLast" variant="secondary" :label="t('tamagotchi.stage.onboarding.actions.skip')" @click="skip" />
        <div :class="['flex-1']" />
        <Button v-if="!isFirst" variant="secondary" :label="t('tamagotchi.stage.onboarding.actions.back')" @click="back" />
        <Button v-if="!isLast" variant="primary" color="primary" :label="t('tamagotchi.stage.onboarding.actions.next')" @click="next" />
        <Button v-else variant="primary" color="primary" :label="t('tamagotchi.stage.onboarding.actions.finish')" @click="finish" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
