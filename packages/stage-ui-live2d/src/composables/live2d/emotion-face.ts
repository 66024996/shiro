import type { MotionManagerPlugin } from './motion-manager'

import { Emotion } from '../../constants/emotions'

/** Offsets for standard Cubism face parameters, keyed by parameter ID. */
export type EmotionFaceOffsets = Readonly<Record<string, number>>

/**
 * Face parameter offsets that show each emotion on a model without expression files, such as Hiyori.
 *
 * The plugin adds the offsets to the values that the current motion sets, so idle motion still moves the face.
 * Eye opening and mouth opening stay out of the presets, because blinking and lip sync own them.
 */
export const EMOTION_FACE_OFFSETS: Readonly<Record<Emotion, EmotionFaceOffsets>> = {
  [Emotion.Neutral]: {},
  [Emotion.Happy]: {
    ParamEyeLSmile: 1,
    ParamEyeRSmile: 1,
    ParamMouthForm: 1,
    ParamCheek: 0.6,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
  },
  [Emotion.Sad]: {
    ParamBrowLY: -0.5,
    ParamBrowRY: -0.5,
    ParamBrowLForm: -0.8,
    ParamBrowRForm: -0.8,
    ParamMouthForm: -1,
  },
  // Shiro's anger is sulking. Bangs often hide the brows, so a pout, a blush, and a glance aside carry it.
  [Emotion.Angry]: {
    ParamBrowLAngle: -1,
    ParamBrowRAngle: -1,
    ParamBrowLForm: -1,
    ParamBrowRForm: -1,
    ParamMouthForm: -1,
    ParamCheek: 0.9,
    ParamEyeBallX: 0.6,
    ParamEyeBallY: -0.2,
  },
  [Emotion.Surprise]: {
    ParamBrowLY: 1,
    ParamBrowRY: 1,
    ParamBrowLForm: 0.5,
    ParamBrowRForm: 0.5,
  },
  [Emotion.Awkward]: {
    ParamBrowLForm: -0.6,
    ParamBrowRForm: -0.6,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamMouthForm: -0.4,
    ParamCheek: 0.3,
  },
  [Emotion.Think]: {
    ParamBrowLY: 0.4,
    ParamBrowRY: -0.3,
    ParamMouthForm: -0.3,
    ParamEyeBallY: 0.4,
  },
  [Emotion.Question]: {
    ParamBrowLY: 0.6,
    ParamBrowRY: 0.1,
    ParamMouthForm: -0.2,
  },
  [Emotion.Curious]: {
    ParamBrowLY: 0.4,
    ParamBrowRY: 0.4,
    ParamMouthForm: 0.3,
  },
}

/** How fast the face follows a new emotion. A higher value is faster. About 0.4 s reaches 90% of the change. */
const FOLLOW_PER_SECOND = 6
const SETTLED = 0.001

/**
 * Moves each offset toward its target with an exponential ease, so the face changes smoothly.
 * An offset that reached zero and has no target is dropped.
 */
export function stepEmotionFaceOffsets(
  current: Readonly<Record<string, number>>,
  target: EmotionFaceOffsets,
  timeDelta: number,
): Record<string, number> {
  const blend = 1 - Math.exp(-FOLLOW_PER_SECOND * Math.max(0, timeDelta))
  const next: Record<string, number> = {}
  for (const id of new Set([...Object.keys(current), ...Object.keys(target)])) {
    const from = current[id] ?? 0
    const to = target[id] ?? 0
    const value = from + (to - from) * blend
    if (to !== 0 || Math.abs(value) > SETTLED)
      next[id] = value
  }
  return next
}

/** Returns the face preset for an emotion name. An unknown name gives a neutral face. */
export function emotionFaceOffsetsOf(emotion: string): EmotionFaceOffsets {
  return (EMOTION_FACE_OFFSETS as Readonly<Record<string, EmotionFaceOffsets>>)[emotion] ?? EMOTION_FACE_OFFSETS[Emotion.Neutral]
}

/**
 * Shows the current emotion on the face of a Live2D model. It runs in the final stage, after the motion,
 * and adds each offset to the parameter value. A parameter that the model does not have is skipped.
 */
export function useMotionUpdatePluginEmotionFace(emotion: () => string): MotionManagerPlugin {
  let offsets: Record<string, number> = {}

  return (ctx) => {
    offsets = stepEmotionFaceOffsets(offsets, emotionFaceOffsetsOf(emotion()), ctx.timeDelta)
    for (const [id, offset] of Object.entries(offsets)) {
      if (ctx.model.getParameterIndex(id) < 0)
        continue
      ctx.model.setParameterValueById(id, ctx.model.getParameterValueById(id) + offset)
    }
  }
}
