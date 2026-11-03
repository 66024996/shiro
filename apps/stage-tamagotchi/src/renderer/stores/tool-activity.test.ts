import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useToolActivityStore, withToolActivity } from './tool-activity'

function tool(name: string, execute: ExecutableTool['execute']): ExecutableTool {
  return { id: name, type: 'function', function: { name, parameters: { type: 'object', properties: {} } }, execute }
}

describe('withToolActivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('records a running call, then its result, and passes the result through', async () => {
    const activity = useToolActivityStore()
    let resolveCall: (value: string) => void = () => {}
    const wrapped = withToolActivity(tool('system_status', () => new Promise<string>((resolve) => {
      resolveCall = resolve
    })), activity)

    const pending = wrapped.execute({}, { messages: [], toolCallId: 'c1' })
    expect(activity.calls[0]).toMatchObject({ name: 'system_status', status: 'running' })

    resolveCall('ok')
    await expect(pending).resolves.toBe('ok')
    expect(activity.calls[0]).toMatchObject({ status: 'succeeded' })
    expect(activity.calls[0]?.durationMs).toBeTypeOf('number')
  })

  it('records a failure and rethrows the error', async () => {
    const activity = useToolActivityStore()
    const wrapped = withToolActivity(tool('file_delete', async () => {
      throw new Error('The user denied this action.')
    }), activity)

    await expect(wrapped.execute({}, { messages: [], toolCallId: 'c2' })).rejects.toThrow('denied')
    expect(activity.calls[0]).toMatchObject({ name: 'file_delete', status: 'failed', error: 'The user denied this action.' })
  })
})
