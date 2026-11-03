<script setup lang="ts">
import type { OllamaServiceStatus } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, FieldSelect } from '@proj-airi/ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronOllamaStatusGet } from '../../../shared/eventa'

const { t } = useI18n()
const getOllamaStatus = useElectronEventaInvoke(electronOllamaStatusGet)
const providers = useProviderStore()
const providerConfig = useProviderConfigStore()
const consciousness = useConsciousnessStore()

const noModels: string[] = []
const status = ref<OllamaServiceStatus>()
const selectedModel = ref('')
const error = ref('')
const busy = ref(false)
let statusTimer: number | undefined

const modelOptions = computed(() => (status.value?.models ?? noModels).map(name => ({
  label: name,
  value: name,
})))

watch(() => status.value?.models, (models) => {
  if (!models?.length) {
    selectedModel.value = ''
    return
  }

  if (!models.includes(selectedModel.value))
    selectedModel.value = models.find(name => name === 'shiro:latest') ?? models[0]
}, { immediate: true })

async function refreshStatus() {
  try {
    status.value = await getOllamaStatus()
    error.value = ''
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.ollama.status-error')
  }
}

async function activateModel() {
  if (!selectedModel.value || busy.value)
    return

  busy.value = true
  error.value = ''
  try {
    await providers.initializeProvider('ollama')
    await providerConfig.patchProviderConfig('ollama', { baseUrl: 'http://127.0.0.1:11434/v1/' })
    await providers.forceProviderConfigured('ollama')
    consciousness.activeProvider = 'ollama'
    consciousness.activeModel = selectedModel.value
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.ollama.activate-error')
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  void refreshStatus()
  statusTimer = window.setInterval(() => void refreshStatus(), 10000)
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
        {{ t('tamagotchi.settings.pages.local-ai.ollama.title') }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.local-ai.ollama.description') }}
      </p>
    </div>

    <div :class="['flex flex-col gap-1 text-sm']">
      <p>{{ t(`tamagotchi.settings.pages.local-ai.ollama.state.${status?.state ?? 'checking'}`) }}</p>
      <p v-if="status?.message" :class="['text-neutral-500 dark:text-neutral-400']">
        {{ status.message }}
      </p>
    </div>

    <FieldSelect
      v-if="modelOptions.length"
      v-model="selectedModel"
      :label="t('tamagotchi.settings.pages.local-ai.ollama.model-label')"
      :description="t('tamagotchi.settings.pages.local-ai.ollama.model-description')"
      :options="modelOptions"
    />

    <div :class="['flex flex-wrap gap-2']">
      <Button
        :label="t('tamagotchi.settings.pages.local-ai.ollama.refresh')"
        :loading="busy"
        icon="i-solar:refresh-bold-duotone"
        @click="refreshStatus"
      />
      <Button
        v-if="status?.state === 'available' && modelOptions.length"
        :label="t('tamagotchi.settings.pages.local-ai.ollama.use-model')"
        :loading="busy"
        icon="i-solar:check-circle-bold-duotone"
        @click="activateModel"
      />
    </div>

    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </section>
</template>
