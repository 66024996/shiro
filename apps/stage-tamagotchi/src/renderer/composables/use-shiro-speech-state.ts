import type { ShiroSpeechServiceStatus } from '../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { onScopeDispose, shallowRef } from 'vue'

import { electronShiroSpeechStatusGet } from '../../shared/eventa'

const STARTING_POLL_MS = 1000
const RUNNING_POLL_MS = 10_000

/**
 * Tracks the offline speech service state. It checks every second while the service starts,
 * and every 10 seconds after that, so a stopped service shows soon.
 *
 * A failed status request gives `error`, so callers do not wait for a service that cannot answer.
 */
export function useShiroSpeechState() {
  const getStatus = useElectronEventaInvoke(electronShiroSpeechStatusGet)
  const state = shallowRef<ShiroSpeechServiceStatus['state']>('starting')
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  async function poll() {
    try {
      state.value = (await getStatus()).state
    }
    catch {
      state.value = 'error'
    }
    if (!disposed)
      timer = setTimeout(poll, state.value === 'starting' ? STARTING_POLL_MS : RUNNING_POLL_MS)
  }

  void poll()
  onScopeDispose(() => {
    disposed = true
    if (timer)
      clearTimeout(timer)
  })

  return { state }
}
