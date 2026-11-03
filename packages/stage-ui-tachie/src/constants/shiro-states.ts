import type { TachieEmotion } from './emotions'

/**
 * Assistant-level avatar states for Shiro.
 *
 * These are independent from the LLM emotion tokens (ACT). The state store in stage-ui picks a state,
 * and each renderer maps it to its own images or expressions. So a Live2D driver can replace PNGtuber
 * without a change to the state logic.
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
  speaking: 'speaking',
  happy: 'happy',
  angry: 'angry',
  concerned: 'concerned',
  sad: 'sad',
  surprised: 'surprised',
  gaming: 'gaming',
  error: 'error',
  permission: 'permission',
}

export function resolveShiroAvatarEmotion(state: ShiroAvatarState | undefined): TachieEmotion {
  if (!state)
    return 'neutral'

  return SHIRO_STATE_TO_TACHIE[state] ?? 'neutral'
}
