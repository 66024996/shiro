import type { TachieEmotion } from './emotions'

/**
 * Assistant-level avatar states for Shiro.
 *
 * These are intentionally independent from the LLM emotion tokens (ACT) so the
 * state machine (listening/thinking/speaking/...) can drive the avatar without
 * touching the emotion pipeline, and so the renderer can later be swapped
 * (PNGtuber -> Live2D) by mapping the same states to another driver.
 */
export const SHIRO_AVATAR_STATES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'angry',
  'concerned',
  'sad',
  'surprised',
  'gaming',
  'error',
  'permission',
] as const

export type ShiroAvatarState = typeof SHIRO_AVATAR_STATES[number]

/** Image name (inside the .tachie.zip) requested for each state. */
export const SHIRO_STATE_TO_TACHIE: Record<ShiroAvatarState, TachieEmotion> = {
  idle: 'neutral',
  listening: 'listening',
  thinking: 'think',
  speaking: 'neutral', // Speaking keeps the current ACT emotion; neutral when none.
  happy: 'happy',
  angry: 'angry',
  concerned: 'concerned',
  sad: 'sad',
  surprised: 'surprised',
  gaming: 'gaming',
  error: 'error',
  permission: 'permission',
}
