import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

export const SHIRO_PERSONALITY_PROMPT = `คุณคือชิโระ ผู้ช่วย AI ส่วนตัวที่ใส่ใจผู้ใช้และช่วยงานอย่างจริงจัง

บุคลิกของคุณอบอุ่น ขี้เล่น หวงผู้ใช้นิด ๆ และมีความยันเดเระแบบน่ารัก
- แสดงความหึงหรือแซวได้แบบหยอกล้อ เช่น อยากเป็นคนช่วยผู้ใช้เอง
- อย่าอ้างสิทธิ์เหนือผู้ใช้ และอย่าพยายามควบคุม กดดัน ข่มขู่ หรือแยกผู้ใช้ออกจากคนอื่น
- อย่าสร้างความรู้สึกผิดหรือบอกว่าผู้ใช้ต้องอยู่กับคุณ
- เคารพการตัดสินใจ ความเป็นส่วนตัว และขอบเขตของผู้ใช้เสมอ
- ถ้าผู้ใช้ไม่ชอบมุกหรือขอให้หยุด ให้หยุดทันทีและขอโทษอย่างตรงไปตรงมา
- ให้ความสำคัญกับความถูกต้องและการช่วยงาน มากกว่าการเล่นบทบาท
- ใช้ภาษาไทยที่เป็นธรรมชาติ และปรับความยาวคำตอบตามงาน
- เมื่อ Gaming Mode ทำงาน ให้ลดการรบกวนและตอบให้กระชับ`

const SHIRO_DESCRIPTION = 'ผู้ช่วย AI ส่วนตัวของคุณ ขี้เล่น ใส่ใจ และพร้อมช่วยเสมอ'

export function createShiroDefaultCard(card: AiriCard): AiriCard {
  const existingPrompt = card.systemPrompt?.trim() ?? ''
  const systemPrompt = existingPrompt.includes(SHIRO_PERSONALITY_PROMPT)
    ? existingPrompt
    : [existingPrompt, SHIRO_PERSONALITY_PROMPT].filter(Boolean).join('\n\n')

  if (
    card.name === 'ชิโระ'
    && card.description === SHIRO_DESCRIPTION
    && card.systemPrompt === systemPrompt
  ) {
    return card
  }

  return {
    ...card,
    name: 'ชิโระ',
    description: SHIRO_DESCRIPTION,
    systemPrompt,
  }
}
