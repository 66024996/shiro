import type { Rectangle } from 'electron'

import type { CompactModeWindow } from './compact'

import { screen } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { computeCompactBounds, createMainWindowCompactMode } from './compact'

// NOTICE:
// Mocking 'electron' keeps Vitest from loading the real Electron binary in a Node test run.
// Same reason as apps/stage-tamagotchi/src/main/windows/shared/display.test.ts.
// Remove it if main-process tests run inside an Electron-based runner.
vi.mock('electron', () => ({
  screen: {
    getDisplayMatching: vi.fn(),
  },
}))

const workArea: Rectangle = { x: 0, y: 0, width: 1920, height: 1040 }

function createWindow(bounds: Rectangle) {
  let current = bounds
  let resized: (() => void) | undefined
  const window: CompactModeWindow = {
    getBounds: () => current,
    setBounds: (next) => {
      current = next
    },
    isDestroyed: () => false,
    on: (_event, listener) => {
      resized = listener
    },
  }
  return {
    window,
    bounds: () => current,
    userResize: (next: Rectangle) => {
      current = next
      resized?.()
    },
  }
}

describe('computeCompactBounds', () => {
  it('places a portrait card in the bottom-right corner', () => {
    expect(computeCompactBounds(workArea)).toEqual({ x: 1644, y: 677, width: 260, height: 347 })
  })

  it('keeps a remembered size inside a small work area', () => {
    const bounds = computeCompactBounds({ x: 100, y: 0, width: 400, height: 300 }, { width: 800, height: 900 })

    expect(bounds).toEqual({ x: 116, y: 16, width: 368, height: 268 })
  })
})

describe('createMainWindowCompactMode', () => {
  it('restores the earlier bounds when compact mode ends', () => {
    vi.mocked(screen.getDisplayMatching).mockReturnValue({ workArea } as Electron.Display)
    const normal = { x: 300, y: 100, width: 900, height: 700 }
    const { window, bounds } = createWindow(normal)
    const compactMode = createMainWindowCompactMode(window)

    compactMode.setCompact(true)
    compactMode.setCompact(true)
    expect(bounds()).toEqual(computeCompactBounds(workArea))

    compactMode.setCompact(false)
    expect(bounds()).toEqual(normal)
  })

  it('reuses the size that the user chose while compact', () => {
    vi.mocked(screen.getDisplayMatching).mockReturnValue({ workArea } as Electron.Display)
    const { window, bounds, userResize } = createWindow({ x: 300, y: 100, width: 900, height: 700 })
    const compactMode = createMainWindowCompactMode(window)

    compactMode.setCompact(true)
    userResize({ x: 1500, y: 600, width: 300, height: 400 })
    compactMode.setCompact(false)
    compactMode.setCompact(true)

    expect(bounds()).toEqual(computeCompactBounds(workArea, { width: 300, height: 400 }))
  })
})
