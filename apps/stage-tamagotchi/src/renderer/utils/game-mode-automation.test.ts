import { describe, expect, it } from 'vitest'

import { GameModeAutomation } from './game-mode-automation'

const league = { name: 'League of Legends', processName: 'League of Legends.exe' }

/** Simulates the store and its watcher, which reports each change after the change. */
function createAutomation(initialGaming = false) {
  let gaming = initialGaming
  const automation = new GameModeAutomation(() => gaming, (next) => {
    gaming = next
    automation.onGamingModeChange(next)
  })
  return {
    automation,
    gaming: () => gaming,
    userSets(next: boolean) {
      gaming = next
      automation.onGamingModeChange(next)
    },
  }
}

describe('gameModeAutomation', () => {
  it('turns Gaming Mode on when a game starts and off when it ends', () => {
    const { automation, gaming } = createAutomation()

    automation.onGameChange(league)
    expect(gaming()).toBe(true)

    automation.onGameChange(null)
    expect(gaming()).toBe(false)
  })

  it('keeps Gaming Mode off after the user turns it off during the game', () => {
    const { automation, gaming, userSets } = createAutomation()
    automation.onGameChange(league)

    userSets(false)
    automation.onGameChange(league)
    expect(gaming()).toBe(false)

    automation.onGameChange(null)
    automation.onGameChange(league)
    expect(gaming()).toBe(true)
  })

  it('keeps Gaming Mode on after a game ends when the user turned it on', () => {
    const { automation, gaming, userSets } = createAutomation()
    userSets(true)

    automation.onGameChange(league)
    automation.onGameChange(null)

    expect(gaming()).toBe(true)
  })

  it('keeps Gaming Mode on when the user turns it on again during the game', () => {
    const { automation, gaming, userSets } = createAutomation()
    automation.onGameChange(league)
    userSets(false)
    userSets(true)

    automation.onGameChange(null)

    expect(gaming()).toBe(true)
  })
})
