<script setup lang="ts">
import type { DeveloperActionRecord, DeveloperMetrics } from '../../../shared/eventa/developer'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { useAvatarStateStore } from '@proj-airi/stage-ui/stores/avatar-state'
import { useChatMetricsStore } from '@proj-airi/stage-ui/stores/chat-metrics'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox } from '@proj-airi/ui'
import { useDocumentVisibility, useIntervalFn, useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { developerActionsGet, developerLogsGet, developerMetricsGet } from '../../../shared/eventa/developer'
import { useToolActivityStore } from '../../stores/tool-activity'
import { useVoiceLogStore } from '../../stores/voice-log'

const { t } = useI18n()
const enabled = useLocalStorage('settings/shiro/developer-mode', false)
const visibility = useDocumentVisibility()

const getMetrics = useElectronEventaInvoke(developerMetricsGet)
const getLogs = useElectronEventaInvoke(developerLogsGet)
const getActions = useElectronEventaInvoke(developerActionsGet)

const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { rounds } = storeToRefs(useChatMetricsStore())
const { calls } = storeToRefs(useToolActivityStore())
const { entries: voiceEntries } = storeToRefs(useVoiceLogStore())
const { currentState } = storeToRefs(useAvatarStateStore())
const { gamingMode } = storeToRefs(useAssistantModeStore())
const { enabled: microphoneEnabled, permissionGranted: microphoneGranted } = storeToRefs(useSettingsAudioDevice())

const metrics = ref<DeveloperMetrics>()
const logs = ref<string[]>([])
const actions = ref<DeveloperActionRecord[]>([])
const error = ref('')
const sampling = ref(false)

const active = computed(() => enabled.value && visibility.value === 'visible')
const runningTool = computed(() => calls.value.find(call => call.status === 'running'))
const lastRound = computed(() => rounds.value[0])
const shiroProcesses = computed(() => [...(metrics.value?.processes ?? [])].sort((left, right) => right.ramMb - left.ramMb))
const shiroTotals = computed(() => shiroProcesses.value.reduce((sum, item) => ({
  cpu: sum.cpu + item.cpuPercent,
  ram: sum.ram + item.ramMb,
  gpu: sum.gpu + item.gpuPercent,
  vram: sum.vram + item.vramMb,
}), { cpu: 0, ram: 0, gpu: 0, vram: 0 }))

async function refreshMetrics() {
  // A sample takes about 1 second. Skip a tick while the last one still runs.
  if (!active.value || sampling.value)
    return
  sampling.value = true
  try {
    metrics.value = await getMetrics()
    error.value = ''
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.developer-mode.error')
  }
  finally {
    sampling.value = false
  }
}

async function refreshLogs() {
  if (!active.value)
    return
  try {
    logs.value = (await getLogs()).slice(-120)
  }
  catch {}
}

async function refreshActions() {
  if (!active.value)
    return
  try {
    actions.value = await getActions()
  }
  catch {}
}

useIntervalFn(refreshMetrics, 3000)
useIntervalFn(refreshLogs, 3000)
useIntervalFn(refreshActions, 6000)
watch(active, (value) => {
  if (!value)
    return
  void refreshMetrics()
  void refreshLogs()
  void refreshActions()
}, { immediate: true })

function formatMs(value?: number) {
  if (value === undefined)
    return '-'
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

function formatTime(time: number | string) {
  return new Date(time).toLocaleTimeString()
}
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <section :class="['flex flex-col gap-3 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.developer-mode.description') }}
      </p>
      <FieldCheckbox v-model="enabled" :label="t('tamagotchi.settings.pages.developer-mode.toggle')" />
    </section>

    <template v-if="enabled">
      <section :class="['grid grid-cols-2 gap-3 sm:grid-cols-4']">
        <div
          v-for="item in [
            { label: t('tamagotchi.settings.pages.developer-mode.state'), value: currentState },
            { label: t('tamagotchi.settings.pages.developer-mode.mode'), value: gamingMode ? 'Gaming' : 'Normal' },
            { label: t('tamagotchi.settings.pages.developer-mode.microphone'), value: microphoneEnabled && microphoneGranted ? 'On' : 'Off' },
            { label: t('tamagotchi.settings.pages.developer-mode.tool'), value: runningTool?.name ?? '-' },
          ]" :key="item.label" :class="['rounded-xl bg-neutral-100/80 p-3 dark:bg-neutral-800/70']"
        >
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ item.label }}
          </p>
          <p :class="['font-mono text-sm font-semibold']">
            {{ item.value }}
          </p>
        </div>
      </section>

      <section :class="['flex flex-col gap-2 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
        <h2 :class="['text-base font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.llm-title') }}
        </h2>
        <p :class="['font-mono text-sm']">
          {{ activeProvider || '-' }} / {{ activeModel || '-' }}
        </p>
        <p v-if="lastRound" :class="['font-mono text-sm']">
          {{ t('tamagotchi.settings.pages.developer-mode.last-round', {
            ttfb: formatMs(lastRound.ttfbMs),
            duration: formatMs(lastRound.durationMs),
            input: lastRound.inputTokens ?? '-',
            output: lastRound.outputTokens ?? '-',
          }) }}
        </p>
        <table v-if="rounds.length" :class="['w-full text-left font-mono text-xs']">
          <thead :class="['text-neutral-500 dark:text-neutral-400']">
            <tr>
              <th>{{ t('tamagotchi.settings.pages.developer-mode.time') }}</th>
              <th>TTFB</th>
              <th>{{ t('tamagotchi.settings.pages.developer-mode.duration') }}</th>
              <th>{{ t('tamagotchi.settings.pages.developer-mode.tokens') }}</th>
              <th>{{ t('tamagotchi.settings.pages.developer-mode.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="round in rounds.slice(0, 8)" :key="round.roundId">
              <td>{{ formatTime(round.startedAt) }}</td>
              <td>{{ formatMs(round.ttfbMs) }}</td>
              <td>{{ formatMs(round.durationMs) }}</td>
              <td>{{ round.inputTokens ?? '-' }} / {{ round.outputTokens ?? '-' }}</td>
              <td>{{ round.status }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section :class="['flex flex-col gap-2 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
        <h2 :class="['text-base font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.resources-title') }}
        </h2>
        <p v-if="metrics" :class="['font-mono text-sm']">
          {{ t('tamagotchi.settings.pages.developer-mode.system', {
            cpu: metrics.system.cpuPercent,
            ramUsed: (metrics.system.ramUsedMb / 1024).toFixed(1),
            ramTotal: (metrics.system.ramTotalMb / 1024).toFixed(1),
            gpu: metrics.system.gpuPercent,
            vram: (metrics.system.vramUsedMb / 1024).toFixed(1),
          }) }}
        </p>
        <p v-else :class="['text-sm text-neutral-500']">
          {{ t('tamagotchi.settings.pages.developer-mode.sampling') }}
        </p>
        <table v-if="shiroProcesses.length" :class="['w-full text-left font-mono text-xs']">
          <thead :class="['text-neutral-500 dark:text-neutral-400']">
            <tr>
              <th>{{ t('tamagotchi.settings.pages.developer-mode.process') }}</th>
              <th>PID</th>
              <th>CPU %</th>
              <th>RAM MB</th>
              <th>GPU %</th>
              <th>VRAM MB</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in shiroProcesses" :key="item.pid">
              <td>{{ item.kind }}</td>
              <td>{{ item.pid }}</td>
              <td>{{ item.cpuPercent }}</td>
              <td>{{ item.ramMb }}</td>
              <td>{{ item.gpuPercent }}</td>
              <td>{{ item.vramMb }}</td>
            </tr>
            <tr :class="['font-semibold']">
              <td>{{ t('tamagotchi.settings.pages.developer-mode.total') }}</td>
              <td />
              <td>{{ shiroTotals.cpu.toFixed(1) }}</td>
              <td>{{ shiroTotals.ram }}</td>
              <td>{{ shiroTotals.gpu.toFixed(1) }}</td>
              <td>{{ shiroTotals.vram }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section :class="['flex flex-col gap-2 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
        <h2 :class="['text-base font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.tools-title') }}
        </h2>
        <p v-if="!calls.length" :class="['text-sm text-neutral-500']">
          -
        </p>
        <ul :class="['flex flex-col gap-1 font-mono text-xs']">
          <li v-for="call in calls.slice(0, 10)" :key="call.id">
            {{ formatTime(call.startedAt) }} · {{ call.name }} · {{ call.status }} · {{ formatMs(call.durationMs) }}
            <span v-if="call.error" :class="['text-red-600 dark:text-red-400']">· {{ call.error }}</span>
          </li>
        </ul>
        <h3 :class="['pt-2 text-sm font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.actions-title') }}
        </h3>
        <ul :class="['flex flex-col gap-1 font-mono text-xs']">
          <li v-for="action in actions.slice(0, 10)" :key="action.time + action.summary">
            {{ formatTime(action.time) }} · {{ action.decision }} · {{ action.summary }}
            <span v-if="action.error" :class="['text-red-600 dark:text-red-400']">· {{ action.error }}</span>
          </li>
        </ul>
      </section>

      <section :class="['flex flex-col gap-2 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
        <h2 :class="['text-base font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.voice-title') }}
        </h2>
        <p v-if="!voiceEntries.length" :class="['text-sm text-neutral-500']">
          -
        </p>
        <ul :class="['flex flex-col gap-1 font-mono text-xs']">
          <li v-for="entry in voiceEntries.slice(0, 15)" :key="entry.id" :class="[entry.kind === 'error' && 'text-red-600 dark:text-red-400']">
            {{ formatTime(entry.time) }} · {{ entry.kind }} · "{{ entry.text }}"<span v-if="entry.detail"> · {{ entry.detail }}</span>
          </li>
        </ul>
      </section>

      <section :class="['flex flex-col gap-2 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
        <h2 :class="['text-base font-semibold']">
          {{ t('tamagotchi.settings.pages.developer-mode.logs-title') }}
        </h2>
        <pre :class="['max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-900 p-3 font-mono text-[11px] text-neutral-100']">{{ logs.join('\n') }}</pre>
      </section>

      <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
        {{ error }}
      </p>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.developer-mode.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 17
  icon: i-solar:code-square-bold-duotone
  stageTransition:
    name: slide
</route>
