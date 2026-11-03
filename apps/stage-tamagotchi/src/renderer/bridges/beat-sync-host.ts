import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { setBeatSyncHost } from '@proj-airi/stage-shared/beat-sync'

import { electronBeatSyncHostEnsure, electronBeatSyncHostStarted } from '../../shared/eventa/beat-sync-host'

/**
 * Lets the Beat Sync helpers start the hidden detector renderer on demand.
 * The main process creates it on the first request, not at app start.
 */
export function initializeBeatSyncHostBridge() {
  const { context } = createContext(window.electron.ipcRenderer)
  const ensure = defineInvoke(context, electronBeatSyncHostEnsure)
  const started = defineInvoke(context, electronBeatSyncHostStarted)
  setBeatSyncHost({
    ensure: async () => {
      await ensure()
    },
    started: () => started(),
  })
}
