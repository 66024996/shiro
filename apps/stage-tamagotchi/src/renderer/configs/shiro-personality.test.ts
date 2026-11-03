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
