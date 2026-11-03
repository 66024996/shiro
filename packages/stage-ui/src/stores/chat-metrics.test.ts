import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChatMetricsStore } from './chat-metrics'

describe('useChatMetricsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sums the tokens of every generation in a round and records its timing', () => {
    const store = useChatMetricsStore()

    store.requestStarted({ roundId: 'r1', model: 'shiro:latest', provider: 'ollama' })
    store.firstToken({ roundId: 'r1', ttfbMs: 900 })
    store.firstToken({ roundId: 'r1', ttfbMs: 4000 })
    store.generation({ roundId: 'r1', inputTokens: 4000, outputTokens: 20 })
    store.generation({ roundId: 'r1', inputTokens: 4200, outputTokens: 30 })
    store.roundFinished({ roundId: 'r1', durationMs: 7000 }, 'completed')

    expect(store.rounds[0]).toMatchObject({ model: 'shiro:latest', ttfbMs: 900, inputTokens: 8200, outputTokens: 50, generations: 2, durationMs: 7000, status: 'completed' })
  })

  it('keeps the newest 20 rounds first', () => {
    const store = useChatMetricsStore()

    for (let index = 0; index < 25; index++)
      store.requestStarted({ roundId: `r${index}`, model: 'm', provider: 'p' })

    expect(store.rounds).toHaveLength(20)
    expect(store.rounds[0]?.roundId).toBe('r24')
  })
})
