import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToolCallRecord {
  id: number
  name: string
  startedAt: number
  durationMs?: number
  status: 'running' | 'succeeded' | 'failed'
  error?: string
}

const MAX_RECORDS = 20

/**
 * Records Shiro's tool calls for Developer Mode: the running tool and the last calls.
 * The leading renderer runs the tools. Every window can read the records, because the state syncs.
 */
export const useToolActivityStore = defineStore('tool-activity', () => {
  const calls = ref<ToolCallRecord[]>([])
  let nextId = 1

  function start(name: string) {
    const id = nextId++
    calls.value = [{ id, name, startedAt: Date.now(), status: 'running' as const }, ...calls.value].slice(0, MAX_RECORDS)
    return id
  }

  function finish(id: number, error?: unknown) {
    const call = calls.value.find(item => item.id === id)
    if (!call)
      return
    call.durationMs = Date.now() - call.startedAt
    call.status = error === undefined ? 'succeeded' : 'failed'
    if (error !== undefined)
      call.error = errorMessageFrom(error) ?? 'Unknown error'
  }

  return { calls, start, finish }
}, {
  synced: {
    state: true,
  },
})

/** Wraps a tool so that each call is recorded. The result and errors pass through unchanged. */
export function withToolActivity<T extends ExecutableTool>(tool: T, activity: ReturnType<typeof useToolActivityStore>): T {
  return {
    ...tool,
    execute: async (input, options) => {
      const id = activity.start(tool.function.name)
      try {
        const result = await tool.execute(input, options)
        activity.finish(id)
        return result
      }
      catch (error) {
        activity.finish(id, error)
        throw error
      }
    },
  }
}
