export enum Emotion {
  Happy = 'happy',
  Sad = 'sad',
  Angry = 'angry',
  Think = 'think',
  Surprise = 'surprised',
  Awkward = 'awkward',
  Question = 'question',
  Curious = 'curious',
  Neutral = 'neutral',
}

export const EMOTION_VALUES = Object.values(Emotion)

export const EmotionHappyMotionName = 'Happy'
export const EmotionSadMotionName = 'Sad'
export const EmotionAngryMotionName = 'Angry'
export const EmotionAwkwardMotionName = 'Awkward'
export const EmotionThinkMotionName = 'Think'
export const EmotionSurpriseMotionName = 'Surprise'
export const EmotionQuestionMotionName = 'Question'
export const EmotionNeutralMotionName = 'Idle'
export const EmotionCuriousMotionName = 'Curious'

export const EMOTION_EmotionMotionName_value = {
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
  [Emotion.Question]: EmotionQuestionMotionName,
  [Emotion.Neutral]: EmotionNeutralMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
}

/** A motion of a Live2D model: its group name, and its index inside the group. */
export interface Live2DMotionRef {
  group: string
  index?: number
}

/**
 * Motions to use when a model has no group named after the emotion. The first motion that the model has wins.
 *
 * The names are the common Cubism sample groups. On Hiyori, Tap #1 is a big smile, Tap #0 is surprise,
 * Tap@Body is worry, Flick@Body is a sad, worried face, and Flick is a head tilt.
 * An empty list keeps the current motion, and the face alone shows the emotion.
 */
export const EMOTION_FALLBACK_MOTIONS: Readonly<Record<Emotion, readonly Live2DMotionRef[]>> = {
  [Emotion.Happy]: [{ group: 'Tap', index: 1 }, { group: 'Tap' }],
  [Emotion.Sad]: [{ group: 'Flick@Body' }, { group: 'FlickDown' }],
  [Emotion.Angry]: [{ group: 'Flick' }, { group: 'Flick@Body' }],
  [Emotion.Think]: [],
  [Emotion.Surprise]: [{ group: 'Tap', index: 0 }, { group: 'FlickUp' }],
  [Emotion.Awkward]: [{ group: 'Tap@Body' }],
  [Emotion.Question]: [{ group: 'Flick' }],
  [Emotion.Curious]: [{ group: 'FlickUp' }],
  [Emotion.Neutral]: [],
}

/**
 * Picks the motion that shows an emotion on a model. A group named after the emotion wins.
 * Otherwise the first fallback motion that the model has is used. It returns undefined when no motion fits.
 *
 * `modelMotions` lists every motion of the model, as `availableMotions` stores them.
 */
export function resolveEmotionMotion(
  emotion: string,
  modelMotions: readonly { motionName: string, motionIndex: number }[],
): Live2DMotionRef | undefined {
  const has = (motion: Live2DMotionRef) => modelMotions.some(item =>
    item.motionName === motion.group && (motion.index === undefined || item.motionIndex === motion.index))
  const named = (EMOTION_EmotionMotionName_value as Readonly<Record<string, string>>)[emotion]
  if (named && has({ group: named }))
    return { group: named }
  const fallbacks = (EMOTION_FALLBACK_MOTIONS as Readonly<Record<string, readonly Live2DMotionRef[]>>)[emotion] ?? []
  return fallbacks.find(has)
}

export const EMOTION_VRMExpressionName_value = {
  [Emotion.Happy]: 'happy',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: undefined,
  [Emotion.Surprise]: 'surprised',
  [Emotion.Awkward]: undefined,
  [Emotion.Question]: undefined,
  [Emotion.Neutral]: undefined,
  [Emotion.Curious]: 'surprised',
} satisfies Record<Emotion, string | undefined>
