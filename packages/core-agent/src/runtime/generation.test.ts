import type { CompletionStep, Message } from '@xsai/shared-chat'

import { describe, expect, it } from 'vitest'

import { chatMessagesToProjectionEntries } from '../messages/chat-completions'
import { createGeneration, shouldStopToolLoop } from './generation'

describe('shouldStopToolLoop', () => {
  it('stops before the same tool runs again after a failure', () => {
    const failedStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [],
      toolResults: [{
        args: {},
        isError: true,
        result: 'Desktop control is not available on Windows.',
        toolCallId: 'call-1',
        toolName: 'computer_use',
      }],
    }
    const repeatedCallStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [{
        args: '{"argv":["invoke","display.list"]}',
        toolCallId: 'call-2',
        toolCallType: 'function',
        toolName: 'computer_use',
      }],
      toolResults: [],
    }

    expect(shouldStopToolLoop({
      input: [],
      step: repeatedCallStep,
      steps: [failedStep, repeatedCallStep],
    })).toBe(true)
  })

  it('allows a different tool after a tool failure', () => {
    const failedStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [],
      toolResults: [{
        args: {},
        isError: true,
        result: 'Computer control is not available on Windows.',
        toolCallId: 'call-1',
        toolName: 'computer_use',
      }],
    }
    const fallbackStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [{
        args: '{}',
        toolCallId: 'call-2',
        toolCallType: 'function',
        toolName: 'get_weather',
      }],
      toolResults: [],
    }

    expect(shouldStopToolLoop({
      input: [],
      step: fallbackStep,
      steps: [failedStep, fallbackStep],
    })).toBe(false)
  })

  it('allows the model to return a final response after a tool failure', () => {
    const failedStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [],
      toolResults: [{
        args: {},
        isError: true,
        result: 'Tool failed.',
        toolCallId: 'call-1',
        toolName: 'computer_use',
      }],
    }
    const finalStep: CompletionStep = {
      finishReason: 'stop',
      toolCalls: [],
      toolResults: [],
    }

    expect(shouldStopToolLoop({
      input: [],
      step: finalStep,
      steps: [failedStep, finalStep],
    })).toBe(false)
  })

  it('keeps the failed tool result and omits the blocked follow-up call', async () => {
    const generation = createGeneration({
      model: 'test',
      continuation: (data: Message[]) => ({ protocol: 'chat-completions', scope: 'test', data }),
      project: item => chatMessagesToProjectionEntries([item]),
    })
    const userMessage: Message = { role: 'user', content: 'Check the display.' }
    const failedCall: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'computer_use', arguments: '{"argv":["invoke","display.list"]}' } }],
    }
    const failedResult: Message = {
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'Computer control is not available on Windows.',
    }
    const blockedCall: Message = {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'computer_use', arguments: '{"argv":["invoke","display.list"]}' } }],
    }
    const failedStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [],
      toolResults: [{
        args: { argv: ['invoke', 'display.list'] },
        isError: true,
        result: 'Computer control is not available on Windows.',
        toolCallId: 'call-1',
        toolName: 'computer_use',
      }],
    }
    const blockedStep: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [{
        args: '{"argv":["invoke","display.list"]}',
        toolCallId: 'call-2',
        toolCallType: 'function',
        toolName: 'computer_use',
      }],
      toolResults: [],
    }

    generation.prepareStep({ input: [userMessage] })
    generation.prepareStep({ input: [userMessage, failedCall, failedResult] })
    const turn = await generation.complete(
      Promise.resolve([userMessage, failedCall, failedResult, blockedCall]),
      Promise.resolve([failedStep, blockedStep]),
    )

    expect(turn.rounds).toHaveLength(1)
    expect(turn.rounds[0]?.toolInvocations[0]?.execution).toEqual({
      status: 'failed',
      output: [{ type: 'text', text: 'Computer control is not available on Windows.' }],
    })
  })

  it('keeps the existing ten-step safety limit', () => {
    const step: CompletionStep = {
      finishReason: 'tool-calls',
      toolCalls: [],
      toolResults: [],
    }

    expect(shouldStopToolLoop({
      input: [],
      step,
      steps: Array.from<CompletionStep>({ length: 10 }).fill(step),
    })).toBe(true)
  })
})
