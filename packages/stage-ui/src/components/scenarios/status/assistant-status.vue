<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusCapsule from './status-capsule.vue'

import { useAssistantModeStore } from '../../../stores/assistant-mode'
import { useSpeakingStore } from '../../../stores/audio'
import { useAvatarStateStore } from '../../../stores/avatar-state'

defineProps<{ align?: 'start' | 'center' }>()

const { t } = useI18n()
const { currentState } = storeToRefs(useAvatarStateStore())
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const { gamingMode } = storeToRefs(useAssistantModeStore())

/**
 * What Shiro does now, from the avatar state. An emotion counts as speaking while the voice plays.
 * Idle shows nothing, so the stage stays clear.
 */
const activity = computed(() => {
  switch (currentState.value) {
    case 'permission':
    case 'error':
    case 'listening':
    case 'thinking':
    case 'speaking':
      return currentState.value
    case 'idle':
    case 'gaming':
      return undefined
    default:
      return nowSpeaking.value ? 'speaking' : undefined
  }
})

const icon = computed(() => ({
  permission: 'i-solar:shield-warning-bold-duotone',
  error: 'i-solar:danger-triangle-bold-duotone',
  listening: 'i-solar:microphone-3-bold-duotone',
  thinking: 'i-solar:cpu-bolt-bold-duotone animate-pulse',
  speaking: 'i-solar:soundwave-bold-duotone',
})[activity.value ?? 'speaking'])

const label = computed(() => {
  const parts = activity.value ? [t(`stage.status.assistant.${activity.value}`)] : []
  if (gamingMode.value)
    parts.push(t('stage.status.assistant.gaming'))
  return parts.join(' · ')
})
</script>

<template>
  <StatusCapsule
    v-if="activity || gamingMode"
    :align="align"
    :label="label"
    :tone="activity === 'error' ? 'error' : 'neutral'"
    :data-status="activity ?? 'gaming'"
    reveal
  >
    <template #indicator>
      <span v-if="activity" aria-hidden="true" :class="[icon, 'size-4']" />
      <span v-if="gamingMode" aria-hidden="true" :class="['i-solar:gamepad-bold-duotone size-4', activity && 'ml-1']" />
    </template>
  </StatusCapsule>
</template>
