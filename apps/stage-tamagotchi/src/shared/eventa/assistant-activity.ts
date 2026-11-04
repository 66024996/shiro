import type { GameEntry } from './gaming'

import { defineEventa } from '@moeru/eventa'

/**
 * Work that the main process does for Shiro, sent to the main stage window.
 *
 * - `approval`: a confirmation dialog opened (`pending: true`) or closed.
 * - `action-result`: a desktop action finished. `decision` is its audit decision.
 * - `game`: the running listed game changed. `game` is null when none runs.
 * - `voice-command`: the user pressed the voice command shortcut, so the next utterance is a command.
 */
export type AssistantActivity
  = | { type: 'approval', pending: boolean }
    | { type: 'action-result', action: string, decision: 'allowed' | 'approved' | 'denied' | 'blocked', ok: boolean }
    | { type: 'game', game: GameEntry | null }
    | { type: 'voice-command' }

export const electronAssistantActivity = defineEventa<AssistantActivity>('eventa:event:electron:assistant:activity')
