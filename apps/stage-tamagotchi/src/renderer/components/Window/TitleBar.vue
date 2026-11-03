<script setup lang="ts">
import ShiroAvatar from '../branding/shiro-avatar.vue'

import { useAppRuntime } from '../../composables/runtime'

defineProps<{
  title: string
  icon?: string
  mascot?: boolean
}>()

const emit = defineEmits<{
  titleClick: []
}>()

const { platform } = useAppRuntime()
</script>

<template>
  <div
    :class="[
      'fixed top-0 z-100 w-full py-2 pr-4',
      'w-[100dvw] select-none drag-region',
      'bg-neutral-100 dark:bg-neutral-900',
      platform === 'macos' ? 'pl-20' : 'pl-4',
    ]"
  >
    <div :class="['flex drag-region']">
      <div
        :class="[
          'flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-0.5',
          'bg-transparent transition-all duration-200 ease-in-out',
          'hover:bg-neutral-200 dark:hover:bg-neutral-800',
          '[-webkit-app-region:no-drag]',
        ]"
        @click="emit('titleClick')"
      >
        <ShiroAvatar v-if="mascot" size="sm" />
        <div
          v-else-if="icon"
          :class="[icon, 'select-none whitespace-nowrap text-neutral-400 dark:text-neutral-500']"
        />
        <div><span :class="['select-none whitespace-nowrap text-sm']">{{ title }}</span></div>
      </div>
      <div :class="['w-full drag-region']" />
      <div
        :class="['flex items-center gap-1 [-webkit-app-region:no-drag]']"
      >
        <slot name="actions" />
      </div>
      <!--
        NOTICE:
        The planned collapse feature was not implemented. Keep this icon hidden until the feature exists.
        https://github.com/moeru-ai/airi/issues/1835#issuecomment-4487178613
      -->
      <!--
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" whitespace-nowrap />
      </div>
      -->
    </div>
  </div>
</template>
