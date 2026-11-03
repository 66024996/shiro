import { useElectronEventaContext } from '@proj-airi/electron-vueuse'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useAvatarStateStore } from '@proj-airi/stage-ui/stores/avatar-state'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { storeToRefs } from 'pinia'
import { onScopeDispose, watch } from 'vue'

import { electronAssistantActivity } from '../../shared/eventa/assistant-activity'
import { inferReplyEmotion } from '../utils/reply-emotion'

/** How long the reply emotion stays after Shiro stops speaking. */
const EMOTION_LINGER_MS = 4000

/**
 * Feeds the avatar state store from the main process and the chat.
 *
 * - Approval dialogs show the permission state, and failed actions or chat turns show the error state.
 * - The reply text sets the emotion while Shiro answers. It clears a moment after the reply and the speech end.
 *
 * Call it once from the main stage window. That window leads chat, so the chat hooks fire there.
 */
export function useAvatarSignals() {
  const avatarState = useAvatarStateStore()
  const chatStore = useChatStore()
  const { sending } = storeToRefs(chatStore)
  const { messages } = storeToRefs(useChatSessionStore())
  const { nowSpeaking } = storeToRefs(useSpeakingStore())
  const context = useElectronEventaContext()

  const stopActivity = context.value.on(electronAssistantActivity, (event) => {
    const activity = event?.body
    if (!activity)
      return

    if (activity.type === 'approval') {
      avatarState.setApprovalPending(activity.pending)
      return
    }

    // A denied action is the user's choice, not a failure.
    if (!activity.ok && activity.decision !== 'denied')
      avatarState.flashError()
  })

  watch(() => messages.value.length, (length, previousLength) => {
    if (length > (previousLength ?? length) && messages.value.at(-1)?.role === 'error')
      avatarState.flashError()
  })

  let replyText = ''
  const stopHooks = [
    chatStore.onBeforeSend(async () => {
      replyText = ''
      avatarState.replyEmotion = undefined
    }),
    chatStore.onTokenLiteral(async (literal) => {
      replyText += literal
      const emotion = inferReplyEmotion(replyText)
      if (emotion && emotion !== avatarState.replyEmotion)
        avatarState.replyEmotion = emotion
    }),
    chatStore.onAssistantResponseEnd(async (message) => {
      avatarState.replyEmotion = inferReplyEmotion(message) ?? avatarState.replyEmotion
    }),
  ]

  let lingerTimer: ReturnType<typeof setTimeout> | undefined
  watch([nowSpeaking, sending], ([speaking, busy]) => {
    if (lingerTimer)
      clearTimeout(lingerTimer)
    lingerTimer = undefined
    if (speaking || busy || !avatarState.replyEmotion)
      return

    lingerTimer = setTimeout(() => {
      avatarState.replyEmotion = undefined
      lingerTimer = undefined
    }, EMOTION_LINGER_MS)
  })

  onScopeDispose(() => {
    stopActivity?.()
    for (const stop of stopHooks)
      stop()
    if (lingerTimer)
      clearTimeout(lingerTimer)
  })
}
