<script setup lang="ts">
import type { TachieEmotion, TachieImageSet } from '@proj-airi/stage-ui-tachie'

import { errorMessageFrom } from '@moeru/std'
import { createTachieZip, readTachieZipImages, TACHIE_EMOTION_FALLBACKS } from '@proj-airi/stage-ui-tachie'
import { useGamingAvatarSettingsStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { DisplayModelFormat, useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { BasicInputFile, Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Slot order in the editor. Shiro's assistant states come first, because the stage uses
 * them most. `speaking` has no own image: it keeps the emotion that the reply selected.
 */
const EDITOR_EMOTIONS: TachieEmotion[] = [
  'neutral',
  'listening',
  'think',
  'happy',
  'angry',
  'concerned',
  'sad',
  'surprised',
  'gaming',
  'error',
  'permission',
  'awkward',
  'question',
  'curious',
]

const { t } = useI18n()
const displayModelsStore = useDisplayModelsStore()
const { modelId } = storeToRefs(useGamingAvatarSettingsStore())

const images = ref<TachieImageSet>({})
const previewUrls = ref<Partial<Record<TachieEmotion, string>>>({})
const dirty = ref(false)
const saving = ref(false)
const message = ref('')
const error = ref('')

const canSave = computed(() => dirty.value && !!images.value.neutral && !saving.value)

function emotionLabel(emotion: TachieEmotion) {
  return t(`tamagotchi.settings.pages.gaming-avatar.emotions.${emotion}`)
}

/** Names the image that the stage shows for an empty slot, using the archive fallback chain. */
function fallbackLabel(emotion: TachieEmotion) {
  const fallback = TACHIE_EMOTION_FALLBACKS[emotion]?.find(candidate => images.value[candidate]) ?? 'neutral'
  return t('tamagotchi.settings.pages.gaming-avatar.editor.empty-slot', { fallback: emotionLabel(fallback) })
}

function revokePreview(emotion: TachieEmotion) {
  const url = previewUrls.value[emotion]
  if (url)
    URL.revokeObjectURL(url)
}

function setImage(emotion: TachieEmotion, image: Blob | undefined) {
  revokePreview(emotion)
  const nextImages = { ...images.value }
  const nextPreviews = { ...previewUrls.value }
  if (image) {
    nextImages[emotion] = image
    nextPreviews[emotion] = URL.createObjectURL(image)
  }
  else {
    delete nextImages[emotion]
    delete nextPreviews[emotion]
  }
  images.value = nextImages
  previewUrls.value = nextPreviews
}

function replaceImage(emotion: TachieEmotion, files: File[]) {
  const [file] = files
  if (!file)
    return

  setImage(emotion, file)
  dirty.value = true
  message.value = ''
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/webp', 'image/jpeg']

function dropImage(emotion: TachieEmotion, event: DragEvent) {
  const files = [...event.dataTransfer?.files ?? []].filter(file => ACCEPTED_IMAGE_TYPES.includes(file.type))
  replaceImage(emotion, files)
}

function removeImage(emotion: TachieEmotion) {
  setImage(emotion, undefined)
  dirty.value = true
  message.value = ''
}

async function loadSavedAvatar() {
  if (!modelId.value)
    return

  try {
    const model = await displayModelsStore.getDisplayModel(modelId.value)
    if (!model || model.type !== 'file')
      return

    const saved = await readTachieZipImages(model.file)
    for (const emotion of EDITOR_EMOTIONS)
      setImage(emotion, saved[emotion])
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.gaming-avatar.editor.load-error')
  }
}

async function save() {
  if (!images.value.neutral) {
    error.value = t('tamagotchi.settings.pages.gaming-avatar.editor.neutral-required')
    return
  }

  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const { file, opaqueEmotions } = await createTachieZip(images.value, 'Shiro gaming avatar')
    const previousId = modelId.value
    const model = await displayModelsStore.addDisplayModel(DisplayModelFormat.TachieZip, file)
    modelId.value = model.id
    // The new archive is selected before the old one is removed, so the stage never points at a missing model.
    if (previousId && previousId !== model.id)
      await displayModelsStore.removeDisplayModel(previousId)

    dirty.value = false
    message.value = opaqueEmotions.length > 0
      ? t('tamagotchi.settings.pages.gaming-avatar.editor.opaque-warning', { emotions: opaqueEmotions.map(emotionLabel).join(', ') })
      : t('tamagotchi.settings.pages.gaming-avatar.editor.saved')
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.gaming-avatar.editor.save-error')
  }
  finally {
    saving.value = false
  }
}

async function deleteAvatar() {
  const previousId = modelId.value
  modelId.value = ''
  if (previousId)
    await displayModelsStore.removeDisplayModel(previousId)

  for (const emotion of EDITOR_EMOTIONS)
    setImage(emotion, undefined)
  dirty.value = false
  message.value = ''
}

onMounted(() => void loadSavedAvatar())
onUnmounted(() => {
  for (const emotion of EDITOR_EMOTIONS)
    revokePreview(emotion)
})
</script>

<template>
  <section :class="['flex flex-col gap-4 rounded-2xl bg-neutral-100/80 p-4 dark:bg-neutral-800/70']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-semibold']">
        {{ t('tamagotchi.settings.pages.gaming-avatar.editor.title') }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.gaming-avatar.editor.description') }}
      </p>
    </div>

    <ul :class="['grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4']">
      <li
        v-for="emotion in EDITOR_EMOTIONS"
        :key="emotion"
        :data-testid="`gaming-avatar-slot-${emotion}`"
        :class="['flex flex-col gap-2 p-2 rounded-xl', 'bg-neutral-50 dark:bg-neutral-900/70']"
        @dragover.prevent
        @drop.prevent="dropImage(emotion, $event)"
      >
        <div :class="['flex items-center justify-between gap-2']">
          <span :class="['text-sm font-medium']">
            {{ emotionLabel(emotion) }}<span v-if="emotion === 'neutral'" :class="['text-primary-500']"> *</span>
          </span>
          <button
            v-if="previewUrls[emotion]"
            type="button"
            :class="['i-solar:trash-bin-minimalistic-bold-duotone size-4', 'text-neutral-500 hover:text-red-500']"
            :aria-label="`${t('tamagotchi.settings.pages.gaming-avatar.editor.remove-image')}: ${emotionLabel(emotion)}`"
            @click="removeImage(emotion)"
          />
        </div>
        <BasicInputFile
          :model-value="[]"
          :accept="ACCEPTED_IMAGE_TYPES.join(',')"
          :aria-label="emotionLabel(emotion)"
          :class="[
            'flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-lg',
            'border-2 border-dashed border-neutral-300 dark:border-neutral-700',
          ]"
          is-dragging-classes="border-primary-400 bg-primary-50 dark:bg-primary-950/40"
          @update:model-value="files => replaceImage(emotion, files)"
        >
          <img
            v-if="previewUrls[emotion]"
            :src="previewUrls[emotion]"
            :alt="emotionLabel(emotion)"
            :class="['size-full object-contain']"
          >
          <span v-else :class="['px-2 text-center text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('tamagotchi.settings.pages.gaming-avatar.editor.choose') }}
            <br>
            {{ fallbackLabel(emotion) }}
          </span>
        </BasicInputFile>
      </li>
    </ul>

    <div :class="['flex flex-wrap gap-2']">
      <Button
        variant="primary"
        color="primary"
        :disabled="!canSave"
        :loading="saving"
        :label="saving ? t('tamagotchi.settings.pages.gaming-avatar.editor.saving') : t('tamagotchi.settings.pages.gaming-avatar.editor.save')"
        icon="i-solar:diskette-bold-duotone"
        @click="save"
      />
      <Button
        v-if="modelId"
        :label="t('tamagotchi.settings.pages.gaming-avatar.editor.delete')"
        icon="i-solar:trash-bin-minimalistic-bold-duotone"
        @click="deleteAvatar"
      />
    </div>

    <p v-if="message" role="status" :class="['text-sm text-neutral-600 dark:text-neutral-300']">
      {{ message }}
    </p>
    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </section>
</template>
