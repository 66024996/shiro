import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { describe, expect, it } from 'vitest'

import { createShiroDefaultCard, SHIRO_PERSONALITY_PROMPT } from './shiro-personality'

function createCard(overrides: Partial<AiriCard> = {}): AiriCard {
  return {
    name: 'AIRI',
    version: '1.0.0',
    description: 'Default character',
    systemPrompt: '',
    extensions: {
      airi: {
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
    ...overrides,
  }
}

describe('createShiroDefaultCard', () => {
  it('replaces the default identity with the Shiro persona', () => {
    const card = createCard({ systemPrompt: 'Your name is AIRI.', description: 'Good morning! You are finally awake.' })

    const shiroCard = createShiroDefaultCard(card)

    expect(shiroCard.name).toBe('ชิโระ')
    expect(shiroCard.description).toContain('ดุแต่รัก')
    expect(shiroCard.systemPrompt).toBe(SHIRO_PERSONALITY_PROMPT)
    expect(`${shiroCard.description}
${shiroCard.systemPrompt}`).not.toContain('AIRI')
  })

  it('replaces an older Shiro prompt instead of appending to it', () => {
    const card = createCard({ name: 'ชิโระ', systemPrompt: 'คุณคือชิโระ ผู้ช่วย AI ส่วนตัวรุ่นเก่า' })

    const shiroCard = createShiroDefaultCard(card)

    expect(shiroCard.systemPrompt).toBe(SHIRO_PERSONALITY_PROMPT)
  })

  // ROOT CAUSE:
  //
  // The prompt answered "เปิด Discord" with "ได้ค่ะ" and had no rule to call a tool.
  // qwen3 instruct then replied "ได้ค่ะ" without a tool call for 5 of 16 desktop commands.
  it('tells the model to call a tool for desktop commands', () => {
    expect(SHIRO_PERSONALITY_PROMPT).toContain('ให้เรียกเครื่องมือที่ตรงกับงานทันที')
    expect(SHIRO_PERSONALITY_PROMPT).not.toContain('ให้ตอบสั้น ๆ เช่น "ได้ค่ะ"')
  })

  // ROOT CAUSE:
  //
  // The example reply "เปิดให้แล้วค่ะ" taught the model a finished-task answer.
  // It answered "ปิดเครื่องคิดเลขที" with "ปิดให้แล้วค่ะ" and no tool call (2 of 6 calls in a replay).
  it('does not give a finished-task reply that the model can copy without a tool call', () => {
    expect(SHIRO_PERSONALITY_PROMPT).not.toContain('"เปิดให้แล้วค่ะ"')
    expect(SHIRO_PERSONALITY_PROMPT).toContain('หลังได้ผลจากเครื่องมือ ให้ตอบประโยคเดียวตามผลจริง')
  })

  it('returns the same card when it is already up to date', () => {
    const card = createShiroDefaultCard(createCard())

    expect(createShiroDefaultCard(card)).toBe(card)
  })

  it('preserves the card provider configuration', () => {
    const card = createCard()
    card.extensions.airi.modules.consciousness.provider = 'local-provider'

    const shiroCard = createShiroDefaultCard(card)

    expect(shiroCard.extensions.airi.modules.consciousness.provider).toBe('local-provider')
  })

  it('keeps the persona boundaries against control and threats', () => {
    expect(SHIRO_PERSONALITY_PROMPT).toContain('ดุเพราะรัก ไม่ใช่ดุเพราะต้องการควบคุม')
    expect(SHIRO_PERSONALITY_PROMPT).toContain('ห้ามข่มขู่')
    expect(SHIRO_PERSONALITY_PROMPT).toContain('ยันเดเระ')
  })
})
