<script setup lang="ts">
import type { GameEntry, GamingConfig, RunningAppEntry } from '../../../shared/eventa/gaming'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { Button, FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { gamingConfigGet, gamingConfigSet, gamingDetectedGameGet, gamingRunningAppsList } from '../../../shared/eventa/gaming'

const { t } = useI18n()
const assistantMode = useAssistantModeStore()
const getConfig = useElectronEventaInvoke(gamingConfigGet)
const setConfig = useElectronEventaInvoke(gamingConfigSet)
const getDetectedGame = useElectronEventaInvoke(gamingDetectedGameGet)
const listRunningApps = useElectronEventaInvoke(gamingRunningAppsList)

const config = ref<GamingConfig>()
const detectedGame = ref<GameEntry | null>(null)
const runningApps = ref<RunningAppEntry[]>([])
const selectedRunningApp = ref('')
const newName = ref('')
const newProcessName = ref('')
const error = ref('')

const gamingMode = computed({
  get: () => assistantMode.gamingMode,
  set: value => assistantMode.setGamingMode(value),
})

const autoDetect = computed({
  get: () => config.value?.autoDetect ?? true,
  set: value => void save({ ...config.value!, autoDetect: value }),
})

const runningAppOptions = computed(() => runningApps.value.map(app => ({
  label: `${app.windowTitle} (${app.processName})`,
  value: app.processName,
})))

const canAdd = computed(() => !!newName.value.trim() && !!newProcessName.value.trim())

async function save(next: GamingConfig) {
  try {
    // IPC cannot clone Vue proxies, so send plain objects.
    config.value = await setConfig({
      autoDetect: next.autoDetect,
      games: next.games.map(game => ({ name: game.name, processName: game.processName })),
    })
    error.value = ''
    detectedGame.value = await getDetectedGame()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.gaming-avatar.mode.save-error')
  }
}

function removeGame(processName: string) {
  void save({ ...config.value!, games: config.value!.games.filter(game => game.processName !== processName) })
}

function addGame() {
  if (!canAdd.value || !config.value)
    return
  const processName = newProcessName.value.trim()
  const games = config.value.games.filter(game => game.processName.toLowerCase() !== processName.toLowerCase())
  void save({ ...config.value, games: [...games, { name: newName.value.trim(), processName }] })
  newName.value = ''
  newProcessName.value = ''
  selectedRunningApp.value = ''
}

function pickRunningApp(processName: string) {
  selectedRunningApp.value = processName
  const app = runningApps.value.find(item => item.processName === processName)
  if (!app)
    return
  newProcessName.value = app.processName
  newName.value = app.windowTitle
}

async function refreshRunningApps() {
  try {
    runningApps.value = await listRunningApps()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.gaming-avatar.mode.save-error')
  }
}

async function refreshDetectedGame() {
  try {
    detectedGame.value = await getDetectedGame()
  }
  catch {}
}

onMounted(async () => {
  try {
    config.value = await getConfig()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.gaming-avatar.mode.save-error')
  }
  await refreshDetectedGame()
})
useIntervalFn(refreshDetectedGame, 5000)
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

    <template v-if="config">
      <FieldCheckbox
        v-model="autoDetect"
        :label="t('tamagotchi.settings.pages.gaming-avatar.mode.auto-detect')"
        :description="t('tamagotchi.settings.pages.gaming-avatar.mode.auto-detect-description')"
      />

      <p :class="['text-sm']">
        {{ detectedGame
          ? t('tamagotchi.settings.pages.gaming-avatar.mode.detected', { game: detectedGame.name })
          : t('tamagotchi.settings.pages.gaming-avatar.mode.not-detected') }}
      </p>

      <div :class="['flex flex-col gap-2']">
        <h3 :class="['text-sm font-semibold']">
          {{ t('tamagotchi.settings.pages.gaming-avatar.mode.games-title', { count: config.games.length }) }}
        </h3>
        <ul :class="['flex flex-col gap-1 max-h-64 overflow-y-auto']">
          <li
            v-for="game in config.games"
            :key="game.processName"
            :class="['flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm dark:bg-neutral-900/50']"
          >
            <span :class="['min-w-0 truncate']">
              {{ game.name }}
              <span :class="['text-neutral-500 dark:text-neutral-400']">· {{ game.processName }}</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon="i-solar:trash-bin-minimalistic-bold"
              :label="t('tamagotchi.settings.pages.gaming-avatar.mode.remove')"
              @click="removeGame(game.processName)"
            />
          </li>
        </ul>
      </div>

      <div :class="['flex flex-col gap-2']">
        <h3 :class="['text-sm font-semibold']">
          {{ t('tamagotchi.settings.pages.gaming-avatar.mode.add-title') }}
        </h3>
        <div :class="['flex flex-wrap items-end gap-2']">
          <FieldSelect
            v-if="runningAppOptions.length"
            :model-value="selectedRunningApp"
            :label="t('tamagotchi.settings.pages.gaming-avatar.mode.running-apps')"
            :options="runningAppOptions"
            :class="['min-w-0 flex-1']"
            @update:model-value="value => pickRunningApp(String(value))"
          />
          <Button
            variant="secondary"
            icon="i-solar:refresh-bold-duotone"
            :label="t('tamagotchi.settings.pages.gaming-avatar.mode.load-running-apps')"
            @click="refreshRunningApps"
          />
        </div>
        <FieldInput
          v-model="newName"
          :label="t('tamagotchi.settings.pages.gaming-avatar.mode.game-name')"
          :placeholder="t('tamagotchi.settings.pages.gaming-avatar.mode.game-name-placeholder')"
        />
        <FieldInput
          v-model="newProcessName"
          :label="t('tamagotchi.settings.pages.gaming-avatar.mode.process-name')"
          :description="t('tamagotchi.settings.pages.gaming-avatar.mode.process-name-description')"
          placeholder="VALORANT-Win64-Shipping.exe"
        />
        <div>
          <Button
            icon="i-solar:add-circle-bold-duotone"
            :label="t('tamagotchi.settings.pages.gaming-avatar.mode.add')"
            :disabled="!canAdd"
            @click="addGame"
          />
        </div>
      </div>
    </template>

    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </section>
</template>
