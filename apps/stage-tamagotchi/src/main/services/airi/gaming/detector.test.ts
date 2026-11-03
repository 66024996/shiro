import type { GamingConfig } from '../../../../shared/eventa/gaming'
import type { RunningProcess } from './detector'

import { describe, expect, it, vi } from 'vitest'

import { findRunningGame, GameDetector, parseTasklistCsv } from './detector'

const games: GamingConfig['games'] = [
  { name: 'League of Legends', processName: 'League of Legends.exe' },
  { name: 'VALORANT', processName: 'VALORANT-Win64-Shipping.exe' },
]

describe('parseTasklistCsv', () => {
  it('reads the image name and process ID of each row', () => {
    const output = '"System Idle Process","0","Services","0","8 K"\r\n"League of Legends.exe","4120","Console","1","1,204,332 K"\r\n'

    expect(parseTasklistCsv(output)).toEqual([
      { name: 'System Idle Process', pid: 0 },
      { name: 'League of Legends.exe', pid: 4120 },
    ])
  })
})

describe('findRunningGame', () => {
  it('matches a listed game by its process name, ignoring case', () => {
    expect(findRunningGame(games, [{ name: 'valorant-win64-shipping.exe', pid: 5 }])?.name).toBe('VALORANT')
  })

  it('ignores launchers and other apps', () => {
    expect(findRunningGame(games, [{ name: 'RiotClientServices.exe', pid: 5 }, { name: 'Code.exe', pid: 6 }])).toBeNull()
  })
})

describe('gameDetector', () => {
  function createDetector(config: GamingConfig, processes: RunningProcess[]) {
    const onGameChange = vi.fn()
    const listProcesses = vi.fn(async () => processes)
    const detector = new GameDetector({ listProcesses, getConfig: () => config, onGameChange })
    return { detector, onGameChange, listProcesses, processes }
  }

  it('reports a game once when it starts and once when it ends', async () => {
    const { detector, onGameChange, processes } = createDetector({ autoDetect: true, games }, [{ name: 'League of Legends.exe', pid: 1 }])

    await detector.check()
    await detector.check()
    processes.length = 0
    await detector.check()

    expect(onGameChange.mock.calls).toEqual([[games[0]], [null]])
  })

  it('does not list processes when auto detection is off', async () => {
    const { detector, onGameChange, listProcesses } = createDetector({ autoDetect: false, games }, [{ name: 'League of Legends.exe', pid: 1 }])

    await detector.check()

    expect(listProcesses).not.toHaveBeenCalled()
    expect(onGameChange).not.toHaveBeenCalled()
    expect(detector.currentGame).toBeNull()
  })
})
