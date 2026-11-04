/** Tracks the short-lived command window after a standalone wake word. */
export interface WakeWordInputState {
  commandExpiresAt: number
}

/** Result of applying wake-word policy to one transcript. */
export type WakeWordInputResult = { status: 'ignored' }
  | { status: 'activated' }
  | { status: 'command', text: string }

/** How long the app accepts a command after the wake word alone. */
export const WAKE_WORD_COMMAND_WINDOW_MS = 8000
const WAKE_WORD_SEPARATORS
  = /^[\s,，.!?。！？:：-]+/u
const WAKE_WORD_BOUNDARY = /[\s,，.!?。！？:：-]/u

// Tone marks (U+0E48 to U+0E4C), sara a (U+0E30), and mai taikhu (U+0E47).
const IGNORED_WAKE_WORD_MARKS = new Set(['่', '้', '๊', '๋', '์', 'ะ', '็'])
// Lo ling to ro rua, and sara ii to sara i.
const WAKE_WORD_LETTER_MAP = new Map([['ล', 'ร'], ['ี', 'ิ']])

/**
 * Thai speech recognition often changes the wake word: Whisper small heard "ชิโระ" as "ชิโล", "ชีโล", and "ชิวโร".
 * This form removes tone marks and the short vowel ะ, and maps ล to ร and ี to ิ, so those variants compare equal or close.
 */
function canonicalWakeWordForm(text: string) {
  return [...text]
    .filter(character => !IGNORED_WAKE_WORD_MARKS.has(character))
    .map(character => WAKE_WORD_LETTER_MAP.get(character) ?? character)
    .join('')
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]!
    previous[0] = i
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j]!
      previous[j] = Math.min(above + 1, previous[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[right.length]!
}

/**
 * Returns the length of the wake word at the start of the text, or 0 when it is not there.
 *
 * An exact prefix always counts. A recognition variant counts only when a separator or the text end follows it,
 * and its canonical form differs from the wake word by at most one character. That limits false activations.
 */
export function matchWakeWordPrefix(text: string, wakeWord: string): number {
  if (text.startsWith(wakeWord))
    return wakeWord.length

  const target = canonicalWakeWordForm(wakeWord)
  for (let length = Math.max(1, wakeWord.length - 2); length <= Math.min(text.length, wakeWord.length + 2); length++) {
    const atBoundary = length === text.length || WAKE_WORD_BOUNDARY.test(text[length]!)
    if (atBoundary && editDistance(canonicalWakeWordForm(text.slice(0, length)), target) <= 1)
      return length
  }
  return 0
}

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

  const wakeWordLength = matchWakeWordPrefix(text, phrase)
  if (wakeWordLength > 0) {
    const command = text.slice(wakeWordLength).replace(WAKE_WORD_SEPARATORS, '').trim()
    if (command) {
      state.commandExpiresAt = 0
      return { status: 'command', text: command }
    }

    state.commandExpiresAt = now + WAKE_WORD_COMMAND_WINDOW_MS
    return { status: 'activated' }
  }

  if (state.commandExpiresAt > now) {
    state.commandExpiresAt = 0
    return { status: 'command', text }
  }

  state.commandExpiresAt = 0
  return { status: 'ignored' }
}
