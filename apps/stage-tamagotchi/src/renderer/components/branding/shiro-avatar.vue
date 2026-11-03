<script setup lang="ts">
import { computed } from 'vue'

import avatarSource from '../../assets/shiro-avatar.png'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md'
}>(), {
  size: 'md',
})

const frameClass = computed(() => props.size === 'sm'
  ? 'size-8 rounded-full p-0.5'
  : 'size-14 rounded-2xl p-1')
const imageClass = computed(() => props.size === 'sm'
  ? 'rounded-full'
  : 'rounded-xl')
</script>

<template>
  <span
    aria-hidden="true"
    :class="[
      'shrink-0 bg-gradient-to-br from-primary-300 via-primary-500 to-primary-300 shadow-md shadow-primary-500/20',
      frameClass,
    ]"
  >
    <img
      :src="avatarSource"
      alt=""
      :class="['size-full object-cover', imageClass]"
    >
  </span>
</template>
