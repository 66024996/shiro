/** Tracks the short-lived command window after a standalone wake word. */
export interface WakeWordInputState {
  commandExpiresAt: number
}

/** Result of applying wake-word policy to one transcript. */
export type WakeWordInputResult = { status: 'ignored' }
  | { status: 'activated' }
  | { status: 'command', text: string }

const COMMAND_WINDOW_MS = 8000
const WAKE_WORD_SEPARATORS
  = /^[\s,，.!?。！？:：-]+/u

/**
 * Accepts speech only after the configured wake word or during its short command window.
 *
 * @example
 * resolveWakeWordInput('ชิโระ เปิดไฟ', 'ชิโระ', { commandExpiresAt: 0 }, 0)
 * // => { status: 'command', text: 'เปิดไฟ' }
 */
export function resolveWakeWordInput(
  input: string,
  wakeWord: string,
  state: WakeWordInputState,
  now: number,
): WakeWordInputResult {
  const text = input.normalize('NFKC').trim()
  const phrase = wakeWord.normalize('NFKC').trim()

  if (!text || !phrase)
    return { status: 'ignored' }

  if (text.startsWith(phrase)) {
    const command = text.slice(phrase.length).replace(WAKE_WORD_SEPARATORS, '').trim()
    if (command) {
      state.commandExpiresAt = 0
      return { status: 'command', text: command }
    }

    state.commandExpiresAt = now + COMMAND_WINDOW_MS
    return { status: 'activated' }
  }

  if (state.commandExpiresAt > now) {
    state.commandExpiresAt = 0
    return { status: 'command', text }
  }

  state.commandExpiresAt = 0
  return { status: 'ignored' }
}
