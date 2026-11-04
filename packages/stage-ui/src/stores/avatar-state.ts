import type { ShiroAvatarState } from '@proj-airi/stage-ui-tachie'
import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { Emotion } from '../constants/emotions'

/** Emotions that a reply can give the avatar. */
export type AvatarReplyEmotion = 'happy' | 'angry' | 'concerned' | 'sad' | 'surprised'

/** Inputs that decide the avatar state. */
export interface AvatarStateSignals {
  /** A confirmation dialog waits for the user. */
  permissionPending: boolean
  /** An action or a chat turn failed a moment ago. */
  error: boolean
  /** The user is talking, or the wake word opened the command window. */
  listening: boolean
  /** The assistant voice is playing. */
  speaking: boolean
  /** A chat request is running, or the reply voice is still being made. */
  thinking: boolean
  /** The emotion of the current or the last reply. */
  emotion?: AvatarReplyEmotion
  gaming: boolean
}

/**
 * Picks one avatar state. The first rule that matches wins:
 * permission, error, listening, speaking (with the reply emotion), thinking, the last reply emotion, gaming, idle.
 *
 * Permission and error come first, because the user must see them.
 * Listening comes before speaking, so the avatar reacts when the user talks over it.
 */
export function resolveAvatarState(signals: AvatarStateSignals): ShiroAvatarState {
  if (signals.permissionPending)
    return 'permission'
  if (signals.error)
    return 'error'
  if (signals.listening)
    return 'listening'
  if (signals.speaking)
    return signals.emotion ?? 'speaking'
  if (signals.thinking)
    return 'thinking'
  if (signals.emotion)
    return signals.emotion
  return signals.gaming ? 'gaming' : 'idle'
}

/**
 * The stage emotion for each avatar state, for renderers without Shiro state images, such as Live2D and VRM.
 * A renderer with its own state images, such as Tachie, maps the states itself.
 */
export const AVATAR_STATE_STAGE_EMOTION: Record<ShiroAvatarState, Emotion> = {
  idle: Emotion.Neutral,
  listening: Emotion.Curious,
  thinking: Emotion.Think,
  speaking: Emotion.Neutral,
  happy: Emotion.Happy,
  angry: Emotion.Angry,
  concerned: Emotion.Awkward,
  sad: Emotion.Sad,
  surprised: Emotion.Surprise,
  gaming: Emotion.Happy,
  error: Emotion.Sad,
  permission: Emotion.Question,
}

const DEFAULT_ERROR_MS = 4000

/**
 * Avatar signals that the chat and speech stores do not hold, shared by every window.
 *
 * The main stage window sets them. Timers run in the window that calls an action,
 * so call the timed actions from one window only.
 */
export const useAvatarStateStore = defineStore('avatar-state', () => {
  const userSpeaking = ref(false)
  const awaitingCommand = ref(false)
  const pendingApprovals = ref(0)
  const errorActive = ref(false)
  const replyEmotion = ref<AvatarReplyEmotion>()
  /** The state that the stage shows now. The stage sets it, and Developer Mode reads it. */
  const currentState = ref<ShiroAvatarState>('idle')
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  /** Shows the error state for a short time. */
  function flashError(durationMs = DEFAULT_ERROR_MS) {
    errorActive.value = true
    if (errorTimer)
      clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      errorActive.value = false
      errorTimer = undefined
    }, durationMs)
  }

  function setApprovalPending(pending: boolean) {
    pendingApprovals.value = Math.max(0, pendingApprovals.value + (pending ? 1 : -1))
  }

  return {
    userSpeaking,
    awaitingCommand,
    pendingApprovals,
    errorActive,
    replyEmotion,
    currentState,
    flashError,
    setApprovalPending,
  }
}, {
  synced: {
    state: true,
  },
})
