import { defineStore } from 'pinia'
import { ref } from 'vue'

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

const MAX_ENTRIES = 40

/**
 * Records the voice path for Developer Mode: what speech recognition heard, the wake word result,
 * the command, the reply, and errors. The main stage window writes it, and every window can read it.
 */
export const useVoiceLogStore = defineStore('voice-log', () => {
  const entries = ref<VoiceLogEntry[]>([])
  let nextId = 1

  function add(kind: VoiceLogEntry['kind'], text: string, detail?: string) {
    entries.value = [{ id: nextId++, time: Date.now(), kind, text, ...(detail ? { detail } : {}) }, ...entries.value].slice(0, MAX_ENTRIES)
  }

  return { entries, add }
}, {
  synced: {
    state: true,
  },
})
