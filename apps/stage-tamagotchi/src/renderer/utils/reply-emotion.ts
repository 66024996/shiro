import type { AvatarReplyEmotion } from '@proj-airi/stage-ui/stores/avatar-state'

/**
 * Thai phrases that show an emotion in Shiro's reply. Each match counts once, and the emotion with the most
 * matches wins. A tie goes to the earlier emotion in this list.
 *
 * Shiro's prompt leaves out ACT emotion tokens, because the small local model then skips tool calls.
 * So the app reads the emotion from the reply words.
 *
 * The first version used the first matching rule, with care first. Most replies mention rest or "อย่าลืม",
 * so nearly every reply showed the same worried pose.
 */
const REPLY_EMOTION_RULES: [AvatarReplyEmotion, RegExp][] = [
  // "อย่า" means "do not", but it is also the start of "อย่าง" and "อย่าลืม".
  ['angry', /ไม่ได้นะ|ห้าม|โกรธ|ยึดเมาส์|โทษทีม|อย่า(?![งล])|ดื้อ|งอน|ไม่ได้หึง/g],
  ['sad', /เสียใจ|ขอโทษ|น่าเสียดาย|เศร้า|ไม่ได้ค่ะ|ไม่สำเร็จ|หาไม่เจอ|ไม่สามารถ/g],
  ['surprised', /จริงเหรอ|ว้าว|อ๊ะ|เอ๊ะ|ไม่น่าเชื่อ|ตกใจ|เหรอคะ\?/g],
  ['happy', /ดีใจ|เยี่ยม|เก่ง|ยินดี|สนุก|ฮ่า|555|ชอบ|น่ารัก|สำเร็จ|เรียบร้อย|ให้แล้ว|ได้เลย|ขอบคุณ|เขิน|สวัสดี|อากาศดี/g],
  ['concerned', /ห่วง|พัก|นอน|เหนื่อย|ง่วง|ระวัง|อันตราย|ใกล้เต็ม|เหลือน้อย|ร้อน|เตือน|กินข้าว|กินอะไร|อย่าลืม|ไม่สบาย/g],
]

/** Returns the emotion of a reply text, or undefined when no phrase matches. */
export function inferReplyEmotion(text: string): AvatarReplyEmotion | undefined {
  let best: AvatarReplyEmotion | undefined
  let bestCount = 0
  for (const [emotion, pattern] of REPLY_EMOTION_RULES) {
    const count = new Set(text.match(pattern) ?? []).size
    if (count > bestCount) {
      best = emotion
      bestCount = count
    }
  }
  return best
}
