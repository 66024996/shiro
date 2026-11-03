import type { AvatarReplyEmotion } from '@proj-airi/stage-ui/stores/avatar-state'

/**
 * Thai phrases that show an emotion in Shiro's reply. The first emotion with a match wins,
 * so a care phrase in a happy reply still shows concern, which fits Shiro's character.
 *
 * Shiro's prompt leaves out ACT emotion tokens, because the small local model then skips tool calls.
 * So the app reads the emotion from the reply words.
 */
const REPLY_EMOTION_RULES: [AvatarReplyEmotion, RegExp][] = [
  ['sad', /เสียใจ|ขอโทษ|น่าเสียดาย|เศร้า|ไม่ได้ค่ะ|ไม่สำเร็จ|หาไม่เจอ/],
  ['concerned', /ห่วง|พัก|นอน|เหนื่อย|ระวัง|อันตราย|ใกล้เต็ม|เหลือน้อย|ร้อน|เตือน|กินข้าว|กินอะไร|อย่าลืม|ไม่สบาย/],
  // "อย่า" means "do not", but it is also the start of "อย่าง" and "อย่าลืม".
  ['angry', /ไม่ได้นะ|ห้าม|โกรธ|ยึดเมาส์|โทษทีม|อย่า(?![งล])|ดื้อ/],
  ['surprised', /จริงเหรอ|ว้าว|อ๊ะ|เอ๊ะ|ไม่น่าเชื่อ|ตกใจ|เหรอคะ\?/],
  ['happy', /ดีใจ|เยี่ยม|เก่ง|ยินดี|สนุก|ฮ่า|555|ชอบ|น่ารัก|สำเร็จ|เรียบร้อย|ให้แล้ว|ได้เลย/],
]

/** Returns the emotion of a reply text, or undefined when no phrase matches. */
export function inferReplyEmotion(text: string): AvatarReplyEmotion | undefined {
  return REPLY_EMOTION_RULES.find(([, pattern]) => pattern.test(text))?.[0]
}
