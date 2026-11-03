<script setup lang="ts">
import type { MemoryEntry } from '../../../shared/eventa/memory'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { memoryForget, memoryList } from '../../../shared/eventa/memory'

const { t, locale } = useI18n()
const listMemories = useElectronEventaInvoke(memoryList)
const forgetMemories = useElectronEventaInvoke(memoryForget)

const entries = ref<MemoryEntry[]>([])
const loading = ref(false)
const forgettingId = ref<string>()
const error = ref('')

// Newest first, because the user usually looks for what Shiro learned most recently.
const sortedEntries = computed(() => entries.value.toReversed())
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))

function describeKind(entry: MemoryEntry) {
  return entry.expiresAt === null
    ? t('tamagotchi.settings.pages.local-ai.memory.kind.long-term')
    : t('tamagotchi.settings.pages.local-ai.memory.kind.temporary', { time: timeFormat.value.format(entry.expiresAt) })
}

async function refresh() {
  loading.value = true
  try {
    entries.value = await listMemories()
    error.value = ''
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.memory.load-error')
  }
  finally {
    loading.value = false
  }
}

async function forget(entry: MemoryEntry) {
  forgettingId.value = entry.id
  try {
    await forgetMemories({ ids: [entry.id] })
    entries.value = entries.value.filter(item => item.id !== entry.id)
    error.value = ''
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.local-ai.memory.forget-error')
  }
  finally {
    forgettingId.value = undefined
  }
}

onMounted(() => void refresh())
</script>

<template>
  <section :class="['flex flex-col gap-4 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-semibold']">
        {{ t('tamagotchi.settings.pages.local-ai.memory.title') }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.local-ai.memory.description') }}
      </p>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.local-ai.memory.how-to') }}
      </p>
    </div>

    <p v-if="!loading && sortedEntries.length === 0" :class="['text-sm']">
      {{ t('tamagotchi.settings.pages.local-ai.memory.empty') }}
    </p>

    <ul v-else :class="['flex flex-col gap-2']">
      <li
        v-for="entry in sortedEntries"
        :key="entry.id"
        :class="[
          'flex items-start justify-between gap-3 px-3 py-2 rounded-xl',
          'bg-neutral-50 dark:bg-neutral-900/70',
        ]"
      >
        <div :class="['flex min-w-0 flex-col gap-0.5']">
          <p :class="['text-sm break-words']">
            {{ entry.text }}
          </p>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ describeKind(entry) }}
          </p>
        </div>
        <Button
          size="sm"
          :label="t('tamagotchi.settings.pages.local-ai.memory.forget')"
          :loading="forgettingId === entry.id"
          icon="i-solar:trash-bin-minimalistic-bold-duotone"
          @click="forget(entry)"
        />
      </li>
    </ul>

    <div :class="['flex flex-wrap gap-2']">
      <Button
        :label="t('tamagotchi.settings.pages.local-ai.memory.refresh')"
        :loading="loading"
        icon="i-solar:refresh-bold-duotone"
        @click="refresh"
      />
    </div>

    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </section>
</template>
