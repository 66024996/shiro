// Emoji, skin tone modifiers, regional indicator flags, keycaps, variation selector 16, and zero width joiners.
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{20E3}\u{FE0F}\u{200D}]/gu

/**
 * Removes emoji from reply text, because a speech voice reads them as noise or as their names.
 *
 * It works on streamed chunks too, because it removes each emoji part on its own.
 */
export function removeEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '')
}
