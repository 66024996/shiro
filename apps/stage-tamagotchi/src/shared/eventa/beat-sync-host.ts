import { defineInvokeEventa } from '@moeru/eventa'

/** Creates the hidden Beat Sync renderer if it does not run, and resolves when it answers. */
export const electronBeatSyncHostEnsure = defineInvokeEventa<void>('eventa:invoke:electron:beat-sync-host:ensure')
/** Returns whether the hidden Beat Sync renderer runs. */
export const electronBeatSyncHostStarted = defineInvokeEventa<boolean>('eventa:invoke:electron:beat-sync-host:started')
