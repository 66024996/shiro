<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const resolveAnimation = ref<() => void>()
const { t } = useI18n()
const settingsStore = useSettings()

const removeBeforeEach = router.beforeEach(async (_, __, next) => {
  if (!settingsStore.usePageSpecificTransitions || settingsStore.disableTransitions) {
    next()
    return
  }

  await new Promise<void>((resolve) => {
    resolveAnimation.value = resolve
  })
  removeBeforeEach()
  next()
})

/** Pages for setup and troubleshooting. They are listed after everyday pages, under their own heading. */
const advancedPaths = new Set(['/settings/scene', '/settings/models', '/settings/providers', '/settings/connection', '/settings/developer-mode'])

const settings = computed(() => {
  return router
    .getRoutes()
    .filter(route => route.meta?.settingsEntry)
    .sort((a, b) => (Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0)))
    .map(route => ({
      title: route.meta?.titleKey ? t(route.meta.titleKey as string) : (route.meta?.title as string | undefined) ?? '',
      description: route.meta?.descriptionKey ? t(route.meta.descriptionKey as string) : (route.meta?.description as string | undefined) || '',
      icon: (route.meta?.icon as string | undefined) ?? '',
      to: route.path,
    }))
})

const settingGroups = computed(() => [
  { key: 'general', items: settings.value.filter(setting => !advancedPaths.has(setting.to)) },
  { key: 'advanced', items: settings.value.filter(setting => advancedPaths.has(setting.to)) },
].filter(group => group.items.length > 0))
</script>

<template>
  <div flex="~ col gap-4" font-normal>
    <div />
    <div flex="~ col gap-4" pb-12>
      <template v-for="group in settingGroups" :key="group.key">
        <h2 :class="['px-1 pt-2 text-sm font-medium text-neutral-500 dark:text-neutral-400']">
          {{ t(`tamagotchi.settings.pages.index.groups.${group.key}`) }}
        </h2>
        <IconItem
          v-for="setting in group.items"
          :key="setting.to"
          v-motion
          :initial="{ opacity: 0, y: 10 }"
          :enter="{ opacity: 1, y: 0 }"
          :duration="250"
          :style="{
            transitionDelay: `${settings.indexOf(setting) * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
          }"
          :title="setting.title"
          :description="setting.description"
          :icon="setting.icon"
          :to="setting.to"
        />
      </template>
    </div>
    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-12rem)]" bottom-0 right--10 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div v-motion text="60" i-solar:settings-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.title
  stageTransition:
    name: slide
</route>
