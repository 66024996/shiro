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
  it('creates Shiro identity and adds the personality prompt', () => {
    const card = createCard({ systemPrompt: 'Keep answers useful.' })

    const shiroCard = createShiroDefaultCard(card)

    expect(shiroCard.name).toBe('ชิโระ')
    expect(shiroCard.description).toContain('ผู้ช่วย AI ส่วนตัว')
    expect(shiroCard.systemPrompt).toContain('Keep answers useful.')
    expect(shiroCard.systemPrompt).toContain(SHIRO_PERSONALITY_PROMPT)
  })

  it('does not duplicate the personality prompt', () => {
    const card = createShiroDefaultCard(createCard())

    expect(createShiroDefaultCard(card)).toBe(card)
    expect(card.systemPrompt?.match(/คุณคือชิโระ/g)).toHaveLength(1)
  })

  it('preserves the card provider configuration', () => {
    const card = createCard()
    card.extensions.airi.modules.consciousness.provider = 'local-provider'

    const shiroCard = createShiroDefaultCard(card)

    expect(shiroCard.extensions.airi.modules.consciousness.provider).toBe('local-provider')
  })
})
