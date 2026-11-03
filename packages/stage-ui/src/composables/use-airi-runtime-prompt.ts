import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../constants/emotions'

const RUNTIME_PROMPT_KEYS = [
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

/**
 * Returns the localized emotion and emoji prompt for each model request.
 *
 * A locale with an empty `base.prompt.emotion` leaves out the emotion tokens and the emotion list.
 * Shiro uses this, because a small local model calls tools less often when it must start each reply with an ACT token.
 */
export function useAiriRuntimePrompt() {
  const { locale, t, te } = useI18n()

  return computed(() => {
    if (!RUNTIME_PROMPT_KEYS.every(key => te(key, locale.value)))
      return ''

    const emotionPrompt = t('base.prompt.emotion').trim()
    const emotionParts = emotionPrompt
      ? [
          emotionPrompt,
          EMOTION_VALUES
            .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
            .join('\n'),
        ]
      : []

    return [
      ...emotionParts,
      t('base.prompt.suffix'),
      t('base.prompt.emoji'),
    ].join('\n\n')
  })
}
