import type { LlmRouteInput } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'

import { describe, expect, it } from 'vitest'

import { looksLikeComputerCommand, routeShiroRequest } from './model-route'

type Conversation = LlmRouteInput['conversation']

const models = { toolModel: 'shiro', chatModel: 'shiro-chat' }

function user(id: string, text: string) {
  return { type: 'user' as const, id, content: [{ type: 'text' as const, text }] }
}

type AssistantTurn = Extract<Conversation['turns'][number], { type: 'assistant' }>

/** A minimal assistant turn. The router reads only whether a round invoked tools. */
function assistant(id: string, usedTools: boolean) {
  return {
    type: 'assistant',
    id,
    status: 'completed',
    rounds: [{ id: `${id}-r`, content: [], toolInvocations: usedTools ? [{}] : [] }],
  } as unknown as AssistantTurn
}

describe('looksLikeComputerCommand', () => {
  it.each(['เปิดเครื่องคิดเลขให้หน่อย', 'แรมเหลือเท่าไหร่', 'ปิด Google ให้หน่อย', 'เปิดเพลงในยูทูบ', 'ตอนนี้กี่โมงแล้ว', 'ชิโระ จำไว้ว่าฉันชอบกาแฟ', 'CPU ร้อนไหม'])('treats "%s" as a command', (text) => {
    expect(looksLikeComputerCommand(text)).toBe(true)
  })

  it.each(['อากาศดีจัง', 'วันนี้เป็นไงบ้าง', 'เก่งมาก', 'คิดถึงนะ', 'ง่วงจัง', 'ทำอะไรอยู่'])('treats "%s" as small talk', (text) => {
    expect(looksLikeComputerCommand(text)).toBe(false)
  })
})

describe('routeShiroRequest', () => {
  // ROOT CAUSE:
  //
  // The tool model writes awkward Thai, and the Thai chat model misses tool calls. Each request now goes to
  // the model that fits it.
  it('sends small talk to the chat model without tools', () => {
    const conversation: Conversation = { turns: [user('1', 'อากาศดีจัง')] }
    expect(routeShiroRequest(conversation, models)).toEqual({ model: 'shiro-chat', tools: false })
  })

  it('sends a command to the tool model with tools', () => {
    const conversation: Conversation = { turns: [user('1', 'เปิดเครื่องคิดเลขให้หน่อย')] }
    expect(routeShiroRequest(conversation, models)).toEqual({ model: 'shiro', tools: true })
  })

  it('keeps a short answer to Shiro\'s question about a command on the tool model', () => {
    const conversation: Conversation = { turns: [user('1', 'ปิดกูเกิลให้หน่อย'), assistant('2', false), user('3', 'ใช่ อันนั้น')] }
    expect(routeShiroRequest(conversation, models)).toEqual({ model: 'shiro', tools: true })
  })

  it('sends small talk after a finished command to the chat model', () => {
    const conversation: Conversation = { turns: [user('1', 'เปิดเครื่องคิดเลขให้หน่อย'), assistant('2', true), user('3', 'เก่งมาก')] }
    expect(routeShiroRequest(conversation, models)).toEqual({ model: 'shiro-chat', tools: false })
  })
})
