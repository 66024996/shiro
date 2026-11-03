import { defineEventa } from '@moeru/eventa'

/**
 * Work that the main process does for Shiro, sent to the main stage window for the avatar state.
 *
 * - `approval`: a confirmation dialog opened (`pending: true`) or closed.
 * - `action-result`: a desktop action finished. `decision` is its audit decision.
 */
export type AssistantActivity
  = | { type: 'approval', pending: boolean }
    | { type: 'action-result', action: string, decision: 'allowed' | 'approved' | 'denied' | 'blocked', ok: boolean }

export const electronAssistantActivity = defineEventa<AssistantActivity>('eventa:event:electron:assistant:activity')
