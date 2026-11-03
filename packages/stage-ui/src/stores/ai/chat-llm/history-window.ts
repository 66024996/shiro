import type { Conversation } from '@proj-airi/core-agent'

/**
 * Keeps the system turns and the turns from the `count`-th most recent user turn onward.
 *
 * Use it to keep a small local model on recent history. The model can then follow recent tool calls,
 * and the prompt stays inside its context window. A count of 1 keeps only the newest user turn.
 */
export function keepRecentUserTurns(conversation: Conversation, count: number): Conversation {
  const userIndexes = conversation.turns
    .map((turn, index) => (turn.type === 'user' ? index : -1))
    .filter(index => index >= 0)
  if (count < 1 || userIndexes.length <= count)
    return conversation

  const firstKept = userIndexes[userIndexes.length - count]
  return {
    ...conversation,
    turns: conversation.turns.filter((turn, index) => turn.type === 'system' || index >= firstKept),
  }
}
