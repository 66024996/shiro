import type { Conversation, Turn } from '@proj-airi/core-agent'

import { describe, expect, it } from 'vitest'

import { keepRecentUserTurns } from './history-window'

function user(id: string): Turn {
  return { type: 'user', id, content: [{ type: 'text', text: id }] }
}

function assistant(id: string): Turn {
  return { type: 'assistant', id, status: 'completed', rounds: [] }
}

function system(id: string): Turn {
  return { type: 'system', id, authority: 'system', content: [{ type: 'text', text: id }] }
}

function ids(conversation: Conversation) {
  return conversation.turns.map(turn => turn.id)
}

describe('keepRecentUserTurns', () => {
  const conversation: Conversation = {
    turns: [system('s1'), user('u1'), assistant('a1'), user('u2'), assistant('a2'), system('s2'), user('u3')],
  }

  it('keeps the system turns and the turns from the second newest user turn', () => {
    expect(ids(keepRecentUserTurns(conversation, 2))).toEqual(['s1', 'u2', 'a2', 's2', 'u3'])
  })

  it('keeps only the newest user turn and every system turn when the count is 1', () => {
    expect(ids(keepRecentUserTurns(conversation, 1))).toEqual(['s1', 's2', 'u3'])
  })

  it('returns the same conversation when it has no more user turns than the count', () => {
    expect(keepRecentUserTurns(conversation, 3)).toBe(conversation)
    expect(keepRecentUserTurns(conversation, 0)).toBe(conversation)
  })
})
