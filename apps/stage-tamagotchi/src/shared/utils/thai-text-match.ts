// Tone marks (U+0E48 to U+0E4C), sara a (U+0E30), and mai taikhu (U+0E47).
const IGNORED_MARKS = new Set(['่', '้', '๊', '๋', '์', 'ะ', '็'])
// Lo ling to ro rua, and sara ii to sara i.
const LETTER_MAP = new Map([['ล', 'ร'], ['ี', 'ิ']])

/**
 * Returns a form of Thai text that hides common speech recognition changes.
 *
 * Whisper small often changes tone marks, vowel length, and ล or ร. For example, it heard "ชิโระ" as "ชิโล",
 * and "เครื่องคิดเลข" as "คิดเล็ก". This form removes tone marks and the short vowel ะ, and maps ล to ร and ี to ิ.
 */
export function canonicalThaiForm(text: string) {
  return [...text]
    .filter(character => !IGNORED_MARKS.has(character))
    .map(character => LETTER_MAP.get(character) ?? character)
    .join('')
}

/** Levenshtein distance between two strings, counted in UTF-16 code units. */
export function editDistance(left: string, right: string) {
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
