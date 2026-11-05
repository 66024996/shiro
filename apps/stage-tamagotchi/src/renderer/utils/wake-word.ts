import { canonicalThaiForm, editDistance } from '../../shared/utils/thai-text-match'

/** Tracks the short-lived command window after a standalone wake word. */
export interface WakeWordInputState {
  commandExpiresAt: number
}

/** Result of applying wake-word policy to one transcript. */
export type WakeWordInputResult = { status: 'ignored' }
  | { status: 'activated' }
  | { status: 'command', text: string }

/** How long the app accepts a command after the wake word alone. */
// 8 seconds was too short: users waited for a sign that Shiro heard the name before they spoke.
export const WAKE_WORD_COMMAND_WINDOW_MS = 15_000
const WAKE_WORD_SEPARATORS
  = /^[\s,，.!?。！？:：-]+/u
const WAKE_WORD_BOUNDARY = /[\s,，.!?。！？:：-]/u
// A combining mark or sara a after a match still belongs to the name, for example the tone mark in "ชิโร่".
const WAKE_WORD_NAME_MARK = /[\p{M}ะ]/u
/**
 * Short words that people say before the wake word, as in "โอเคชิโระ". One of them may come first.
 * The list is short on purpose: any longer opening means the user talks about Shiro, not to Shiro.
 */
const WAKE_WORD_LEADING_FILLERS = ['โอเค', 'เอ่อ', 'อ่า', 'เอ้อ', 'นี่', 'เฮ้', 'ฮัลโหล', 'okay', 'ok', 'hey', 'hi', 'hello']

/** Returns the text after one leading filler word, or undefined when the text has no filler. */
function stripLeadingFiller(text: string) {
  const lower = text.toLowerCase()
  const filler = WAKE_WORD_LEADING_FILLERS.find(word => lower.startsWith(word))
  return filler ? text.slice(filler.length).replace(WAKE_WORD_SEPARATORS, '') : undefined
}

/**
 * Returns the length of the wake word at the start of the text, or 0 when it is not there.
 *
 * An exact prefix always counts. A recognition variant counts when a separator or the text end follows it,
 * and its canonical form differs from the wake word by at most one character.
 * Typhoon ASR often writes the command right after the name, as in "ชิโลปิดไฟ". So a variant with the same
 * canonical form also counts without a separator, when no Thai mark that belongs to the name follows it.
 */
export function matchWakeWordPrefix(text: string, wakeWord: string): number {
  if (text.startsWith(wakeWord))
    return wakeWord.length

  const target = canonicalThaiForm(wakeWord)
  const minLength = Math.max(1, wakeWord.length - 2)
  const maxLength = Math.min(text.length, wakeWord.length + 2)
  for (let length = minLength; length <= maxLength; length++) {
    const atBoundary = length === text.length || WAKE_WORD_BOUNDARY.test(text[length]!)
    if (atBoundary && editDistance(canonicalThaiForm(text.slice(0, length)), target) <= 1)
      return length
  }
  for (let length = minLength; length < maxLength; length++) {
    const next = text[length]!
    if (!WAKE_WORD_NAME_MARK.test(next) && canonicalThaiForm(text.slice(0, length)) === target)
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

  const afterFiller = stripLeadingFiller(text)
  const addressed = [text, afterFiller]
    .filter((candidate): candidate is string => !!candidate)
    .map(candidate => ({ candidate, length: matchWakeWordPrefix(candidate, phrase) }))
    .find(match => match.length > 0)
  if (addressed) {
    const command = addressed.candidate.slice(addressed.length).replace(WAKE_WORD_SEPARATORS, '').trim()
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
