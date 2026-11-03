import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

import { baseUrl, getElectronMainDirname, load } from '../../libs/electron/location'
import { protectPrivilegedWindowNavigation } from '../shared/window'

async function createBeatSyncWindow() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/beat-sync.mjs'),
      sandbox: false,
    },
  })

  protectPrivilegedWindowNavigation(window)

  await load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'), 'beat-sync.html'))
  initScreenCaptureForWindow(window)

  return window
}

/**
 * Owns the hidden renderer that runs the Beat Sync capture and detector.
 *
 * The renderer starts on the first request, not at app start, because most sessions never use Beat Sync.
 * An idle session then runs one renderer process less, about 40 MB.
 */
export class BeatSyncHost {
  private pending: Promise<BrowserWindow> | undefined

  /** Returns the window, and creates it on the first call. */
  ensure() {
    this.pending ??= createBeatSyncWindow().then((window) => {
      window.once('closed', () => {
        this.pending = undefined
      })
      return window
    }).catch((error) => {
      this.pending = undefined
      throw error
    })
    return this.pending
  }

  /** Returns whether the window was requested and still exists. */
  async started() {
    if (!this.pending)
      return false
    const window = await this.pending.catch(() => undefined)
    return !!window && !window.isDestroyed()
  }
}

export function setupBeatSync() {
  return new BeatSyncHost()
}
