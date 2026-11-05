import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export interface VoiceLogEntry {
  id: number
  time: number
  /**
   * - `heard`: speech recognition returned this text. `detail` tells the wake word result.
   * - `command`: the text went to chat.
   * - `reply`: Shiro's reply text, which speech output reads.
   * - `error`: voice input failed.
   */
  kind: 'heard' | 'command' | 'reply' | 'error'
  text: string
  detail?: string
}

const MAX_ENTRIES = 100

/**
 * Records the voice path for Developer Mode: what speech recognition heard, the wake word result,
 * the command, the reply, and errors. The main stage window writes it, and every window can read it.
 * It is saved in local storage, so the log of a voice session that failed is still there after a restart.
 */
export const useVoiceLogStore = defineStore('voice-log', () => {
  const entries = useLocalStorage<VoiceLogEntry[]>('shiro/voice-log', [])
  let nextId = Math.max(0, ...entries.value.map(entry => entry.id)) + 1

  function add(kind: VoiceLogEntry['kind'], text: string, detail?: string) {
    entries.value = [{ id: nextId++, time: Date.now(), kind, text, ...(detail ? { detail } : {}) }, ...entries.value].slice(0, MAX_ENTRIES)
  }

  return { entries, add }
}, {
  synced: {
    state: true,
  },
})
