/**
 * Emotion image names recognized inside a Tachie archive.
 *
 * The values intentionally match AIRI's stage emotion contract so the renderer
 * can consume the same events as Live2D, VRM, Spine, and MMD.
 */
export const TACHIE_EMOTIONS = [
  'happy',
  'sad',
  'angry',
  'think',
  'surprised',
  'awkward',
  'question',
  'curious',
  'neutral',
  // Shiro extensions: optional images for assistant states. Missing ones fall
  // back through TACHIE_EMOTION_FALLBACKS and finally to `neutral`.
  'listening',
  'concerned',
  'gaming',
  'error',
  'permission',
] as const

/** Emotion names accepted by the Tachie archive and scene APIs. */
export type TachieEmotion = typeof TACHIE_EMOTIONS[number]

/** Required archive state and fallback for unavailable emotions. */
export const DEFAULT_TACHIE_EMOTION: TachieEmotion = 'neutral'

/**
 * Fallback chain for optional state images. The first image present in the
 * archive wins; `neutral` is always the last resort.
 */
export const TACHIE_EMOTION_FALLBACKS: Partial<Record<TachieEmotion, readonly TachieEmotion[]>> = {
  listening: ['curious', 'neutral'],
  concerned: ['awkward', 'sad', 'neutral'],
  gaming: ['happy', 'neutral'],
  error: ['concerned', 'awkward', 'sad', 'neutral'],
  permission: ['question', 'concerned', 'awkward', 'neutral'],
}

/** Returns whether an arbitrary stage emotion has a Tachie filename mapping. */
export function isTachieEmotion(value: string): value is TachieEmotion {
  return TACHIE_EMOTIONS.includes(value as TachieEmotion)
}
