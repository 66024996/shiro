import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Content-free numbers about one chat round, for a developer view. */
export interface ChatRoundMetrics {
  roundId: string
  model: string
  provider: string
  startedAt: number
  /** Milliseconds from the request to the first text token. */
  ttfbMs?: number
  /** Milliseconds for the whole round, tool calls included. */
  durationMs?: number
  /** Token counts summed over the usage reports of the round. One report can already sum several model requests. */
  inputTokens?: number
  outputTokens?: number
  generations: number
  status: 'running' | 'completed' | 'failed'
}

const MAX_ROUNDS = 20

function addTokens(current: number | undefined, next: number | undefined) {
  return next === undefined ? current : (current ?? 0) + next
}

/**
 * Keeps the numbers of the last chat rounds: model, tokens, time to the first token, and duration.
 * The chat store reports here. Every window can read the rounds, because the state syncs.
 */
export const useChatMetricsStore = defineStore('chat-metrics', () => {
  const rounds = ref<ChatRoundMetrics[]>([])

  function findRound(roundId: string) {
    return rounds.value.find(round => round.roundId === roundId)
  }

  function requestStarted(event: { roundId: string, model: string, provider: string }) {
    if (findRound(event.roundId))
      return
    rounds.value = [
      { roundId: event.roundId, model: event.model, provider: event.provider, startedAt: Date.now(), generations: 0, status: 'running' as const },
      ...rounds.value,
    ].slice(0, MAX_ROUNDS)
  }

  function firstToken(event: { roundId: string, ttfbMs: number }) {
    const round = findRound(event.roundId)
    if (round && round.ttfbMs === undefined)
      round.ttfbMs = event.ttfbMs
  }

  function generation(event: { roundId: string, inputTokens?: number, outputTokens?: number }) {
    const round = findRound(event.roundId)
    if (!round)
      return
    round.generations += 1
    round.inputTokens = addTokens(round.inputTokens, event.inputTokens)
    round.outputTokens = addTokens(round.outputTokens, event.outputTokens)
  }

  function roundFinished(event: { roundId: string, durationMs?: number }, status: 'completed' | 'failed') {
    const round = findRound(event.roundId)
    if (!round)
      return
    round.status = status
    round.durationMs = event.durationMs ?? Date.now() - round.startedAt
  }

  return {
    rounds,
    requestStarted,
    firstToken,
    generation,
    roundFinished,
  }
}, {
  synced: {
    state: true,
  },
})
