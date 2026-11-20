import type { Rectangle } from 'electron'

import { screen } from 'electron'

/** Gap between the compact window and the work-area edge, in DIPs. */
const COMPACT_MARGIN = 16

/** Default size of the Gaming Mode reply box, in DIPs. It holds a few lines of reply text. */
const COMPACT_DEFAULT_SIZE = { width: 360, height: 150 }

/**
 * Computes the compact window bounds in the top-left corner of a display work area.
 *
 * In Gaming Mode the main window is a small reply box there, like a chat overlay in a game.
 * A remembered size is clamped to the work area.
 *
 * @example
 * computeCompactBounds({ x: 0, y: 0, width: 1920, height: 1040 })
 * // => { x: 16, y: 16, width: 360, height: 150 }
 */
export function computeCompactBounds(workArea: Rectangle, size?: Pick<Rectangle, 'width' | 'height'>): Rectangle {
  const { width, height } = size ?? COMPACT_DEFAULT_SIZE

  return {
    x: workArea.x + COMPACT_MARGIN,
    y: workArea.y + COMPACT_MARGIN,
    width: Math.min(width, workArea.width - COMPACT_MARGIN * 2),
    height: Math.min(height, workArea.height - COMPACT_MARGIN * 2),
  }
}

/** The parts of `BrowserWindow` that compact mode uses. */
export interface CompactModeWindow {
  getBounds: () => Rectangle
  setBounds: (bounds: Rectangle) => void
  isDestroyed: () => boolean
  on: (event: 'resized', listener: () => void) => unknown
}

/**
 * Moves the main window into a screen corner during Gaming Mode and back afterwards.
 *
 * State model:
 * - `normalBounds` holds the bounds from before compact mode. It is set on enter and used on exit.
 * - `compactSize` remembers a size that the user chose while compact, for this app session.
 *
 * Calls that do not change the mode are ignored, so every window can request the same mode.
 */
export function createMainWindowCompactMode(window: CompactModeWindow) {
  let normalBounds: Rectangle | undefined
  let compactSize: Pick<Rectangle, 'width' | 'height'> | undefined

  function rememberCompactSize() {
    if (!normalBounds || window.isDestroyed())
      return

    const { width, height } = window.getBounds()
    compactSize = { width, height }
  }

  window.on('resized', rememberCompactSize)

  function setCompact(compact: boolean) {
    if (window.isDestroyed())
      return

    if (compact) {
      if (normalBounds)
        return

      normalBounds = window.getBounds()
      const { workArea } = screen.getDisplayMatching(normalBounds)
      window.setBounds(computeCompactBounds(workArea, compactSize))
      return
    }

    if (!normalBounds)
      return

    const restored = normalBounds
    normalBounds = undefined
    window.setBounds(restored)
  }

  return { setCompact }
}
