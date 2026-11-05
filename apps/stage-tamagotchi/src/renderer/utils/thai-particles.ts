import type { ReplyTextTransform } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'

/**
 * Words after which the polite particle is "คะ", not "ค่ะ": the softener "นะ" and question words.
 * The local model often writes "นะค่ะ" or "ไหมค่ะ", which reads wrong and the voice says with the wrong tone.
 */
const QUESTION_OR_SOFTENER = 'นะ|ไหม|มั้ย|หรือเปล่า|เปล่า|เหรอ|หรอ|ล่ะ|หรือยัง|ไง|อะไร|ไหน|ใคร|เท่าไหร่|เท่าไร|ทำไม|เมื่อไหร่|ยังไง|อย่างไร|กี่โมง'
const WRONG_PARTICLE = new RegExp(`(${QUESTION_OR_SOFTENER})ค่ะ(?=$|[\\s?!.,…ๆ"'])`, 'g')
const QUESTION_MARK_PARTICLE = /ค่ะ(?=\s*\?)/g

/** Characters held back between chunks. A question word plus "ค่ะ" fits in this many characters. */
const HOLD = 12

/** Fixes "ค่ะ" that should be "คะ", after "นะ", after a question word, or before a question mark. */
export function fixThaiPoliteParticles(text: string): string {
  return text.replace(WRONG_PARTICLE, '$1คะ').replace(QUESTION_MARK_PARTICLE, 'คะ')
}

/**
 * A streaming version of `fixThaiPoliteParticles`. A wrong particle can span two chunks, as in "นะค" + "่ะ",
 * so it holds the last characters until the next chunk or the flush.
 */
export function createThaiParticleTransform(): ReplyTextTransform {
  let pending = ''
  return {
    push(text) {
      const fixed = fixThaiPoliteParticles(pending + text)
      const cut = Math.max(0, fixed.length - HOLD)
      pending = fixed.slice(cut)
      return fixed.slice(0, cut)
    },
    flush() {
      const rest = fixThaiPoliteParticles(pending)
      pending = ''
      return rest
    },
  }
}
