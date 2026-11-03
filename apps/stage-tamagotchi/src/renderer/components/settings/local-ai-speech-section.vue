<script setup lang="ts">
import type { ShiroSpeechServiceStatus } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronShiroSpeechStatusGet,
  electronShiroSpeechVoiceImport,
} from '../../../shared/eventa'

const { t } = useI18n()
const getSpeechStatus = useElectronEventaInvoke(electronShiroSpeechStatusGet)
const importVoice = useElectronEventaInvoke(electronShiroSpeechVoiceImport)
const providers = useProviderStore()
const providerConfig = useProviderConfigStore()
const speech = useSpeechStore()
const hearing = useHearingStore()
const speechProviderId = 'openai-compatible-audio-speech'
const transcriptionProviderId = 'openai-compatible-audio-transcription'

const status = ref<ShiroSpeechServiceStatus>({
  state: 'starting',
  voiceConfigured: false,
})
const transcript = ref('')
const transcriptionPrompt = shallowRef('')
const savedTranscriptionPrompt = shallowRef('')
const transcriptionPromptLoaded = shallowRef(false)
const transcriptionPromptError = shallowRef('')
const error = ref('')
const busy = ref(false)
const speechConfigured = computed(() => speech.activeSpeechProvider === 'openai-compatible-audio-speech'
  && hearing.activeTranscriptionProvider === 'openai-compatible-audio-transcription')
const transcriptionPromptDirty = computed(() => transcriptionPrompt.value.trim() !== savedTranscriptionPrompt.value)
const transcriptionPromptTooLong = computed(() => transcriptionPrompt.value.length > 1000)
const statusMessage = computed(() => {
  const message = status.value.message
  if (!message)
    return ''

  if (message.kind === 'service-http-error')
    return t('tamagotchi.settings.pages.local-ai.speech.messages.service-http-error', { status: message.status })

  return t(`tamagotchi.settings.pages.local-ai.speech.messages.${message.kind}`)
})
let statusTimer: number | undefined

async function refreshStatus() {
  try {
    status.value = await getSpeechStatus()
    error.value = ''
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.speech.status-error')
  }
}

async function loadTranscriptionPrompt() {
  try {
    await providers.initializeProvider(transcriptionProviderId)
    const storedPrompt = providerConfig.configs[transcriptionProviderId]?.prompt
    const prompt = typeof storedPrompt === 'string' ? storedPrompt.trim() : ''
    transcriptionPrompt.value = prompt
    savedTranscriptionPrompt.value = prompt
    transcriptionPromptLoaded.value = true
    transcriptionPromptError.value = ''
  }
  catch (cause) {
    transcriptionPromptError.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.speech.prompt-load-error')
  }
}

async function saveTranscriptionPrompt() {
  if (busy.value || !transcriptionPromptLoaded.value || transcriptionPromptTooLong.value)
    return

  busy.value = true
  transcriptionPromptError.value = ''
  const prompt = transcriptionPrompt.value.trim()
  try {
    await providers.initializeProvider(transcriptionProviderId)
    const saved = await providerConfig.patchProviderConfig(transcriptionProviderId, { prompt })
    if (!saved)
      throw new Error('The transcription provider no longer exists')

    savedTranscriptionPrompt.value = prompt
    transcriptionPrompt.value = prompt
  }
  catch (cause) {
    transcriptionPromptError.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.speech.prompt-save-error')
  }
  finally {
    busy.value = false
  }
}

async function importVoiceReference() {
  if (busy.value)
    return

  busy.value = true
  error.value = ''
  try {
    const result = await importVoice({ transcript: transcript.value })
    if (!result.imported)
      return

    transcript.value = ''
    await refreshStatus()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.speech.import-error')
  }
  finally {
    busy.value = false
  }
}

async function activateSpeech() {
  if (busy.value || !transcriptionPromptLoaded.value || transcriptionPromptTooLong.value)
    return

  busy.value = true
  error.value = ''
  transcriptionPromptError.value = ''
  try {
    const baseUrl = 'http://127.0.0.1:5052/v1/'
    const prompt = transcriptionPrompt.value.trim()

    await providers.initializeProvider(speechProviderId)
    const speechConfigSaved = await providerConfig.patchProviderConfig(speechProviderId, { apiKey: 'shiro-local', baseUrl })
    if (!speechConfigSaved)
      throw new Error('The speech provider no longer exists')
    await providers.forceProviderConfigured(speechProviderId)
    await providers.initializeProvider(transcriptionProviderId)
    const transcriptionConfigSaved = await providerConfig.patchProviderConfig(transcriptionProviderId, { apiKey: 'shiro-local', baseUrl, prompt })
    if (!transcriptionConfigSaved)
      throw new Error('The transcription provider no longer exists')
    await providers.forceProviderConfigured(transcriptionProviderId)

    speech.activeSpeechProvider = speechProviderId
    speech.activeSpeechModel = 'omnivoice-thai'
    speech.activeSpeechVoiceId = 'shiro'
    hearing.activeTranscriptionProvider = transcriptionProviderId
    hearing.activeTranscriptionModel = 'whisper-small'
    savedTranscriptionPrompt.value = prompt
    transcriptionPrompt.value = prompt
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.speech.activate-error')
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  void refreshStatus()
  void loadTranscriptionPrompt()
  statusTimer = window.setInterval(() => void refreshStatus(), 5000)
})

onUnmounted(() => {
  if (statusTimer !== undefined)
    window.clearInterval(statusTimer)
})
</script>

<template>
  <section :class="['flex flex-col gap-4 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-semibold']">
        {{ t('tamagotchi.settings.pages.local-ai.speech.title') }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.local-ai.speech.description') }}
      </p>
    </div>

    <div :class="['flex flex-col gap-1 text-sm']">
      <p>{{ t(`tamagotchi.settings.pages.local-ai.speech.state.${status.state}`) }}</p>
      <p v-if="statusMessage" :class="['text-neutral-500 dark:text-neutral-400']">
        {{ statusMessage }}
      </p>
      <p v-if="status.state === 'ready'">
        {{ status.voiceConfigured
          ? t('tamagotchi.settings.pages.local-ai.speech.voice-ready')
          : t('tamagotchi.settings.pages.local-ai.speech.voice-missing') }}
      </p>
    </div>

    <FieldInput
      v-model="transcript"
      :label="t('tamagotchi.settings.pages.local-ai.speech.transcript-label')"
      :description="t('tamagotchi.settings.pages.local-ai.speech.transcript-description')"
      :placeholder="t('tamagotchi.settings.pages.local-ai.speech.transcript-placeholder')"
    />

    <FieldInput
      v-model="transcriptionPrompt"
      :label="t('tamagotchi.settings.pages.local-ai.speech.prompt-label')"
      :description="t('tamagotchi.settings.pages.local-ai.speech.prompt-description')"
      :placeholder="t('tamagotchi.settings.pages.local-ai.speech.prompt-placeholder')"
      :disabled="busy || !transcriptionPromptLoaded"
      :single-line="false"
    />

    <p v-if="transcriptionPromptTooLong" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ t('tamagotchi.settings.pages.local-ai.speech.prompt-too-long') }}
    </p>
    <p v-if="transcriptionPromptError" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ transcriptionPromptError }}
    </p>

    <div :class="['flex flex-wrap gap-2']">
      <Button
        :label="t('tamagotchi.settings.pages.local-ai.speech.import')"
        :loading="busy"
        :disabled="!transcript.trim()"
        icon="i-solar:upload-minimalistic-bold-duotone"
        @click="importVoiceReference"
      />
      <Button
        :label="transcriptionPromptDirty
          ? t('tamagotchi.settings.pages.local-ai.speech.prompt-save')
          : t('tamagotchi.settings.pages.local-ai.speech.prompt-saved')"
        :loading="busy"
        :disabled="busy || !transcriptionPromptLoaded || !transcriptionPromptDirty || transcriptionPromptTooLong"
        @click="saveTranscriptionPrompt"
      />
      <Button
        v-if="status.state === 'ready' && status.voiceConfigured"
        :label="speechConfigured
          ? t('tamagotchi.settings.pages.local-ai.speech.configured')
          : t('tamagotchi.settings.pages.local-ai.speech.activate')"
        :loading="busy"
        :disabled="speechConfigured || !transcriptionPromptLoaded || transcriptionPromptTooLong"
        icon="i-solar:check-circle-bold-duotone"
        @click="activateSpeech"
      />
    </div>

    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </section>
</template>
