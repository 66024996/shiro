import { describe, expect, it } from 'vitest'

import { inferReplyEmotion } from './reply-emotion'

describe('inferReplyEmotion', () => {
  it('reads the emotion of real Shiro replies', () => {
    expect(inferReplyEmotion('เปิดเครื่องคิดเลขให้แล้วค่ะ')).toBe('happy')
    expect(inferReplyEmotion('แรมเหลือ 0.5 GB ค่ะ ใกล้เต็มแล้ว ควรปิดโปรแกรมบางอย่างก่อนดีกว่าค่ะ')).toBe('concerned')
    expect(inferReplyEmotion('ชิโระเปิดโปรแกรมนั้นไม่ได้ค่ะ เดี๋ยวขอเช็กสาเหตุให้นะคะ')).toBe('sad')
    expect(inferReplyEmotion('เล่นได้ค่ะ แต่ถ้าแพ้แล้วโทษทีมอีก ชิโระจะยึดเมาส์นะคะ')).toBe('angry')
    expect(inferReplyEmotion('อ๋อ... ชอบเขามากเหรอคะ? เปล่าค่ะ')).toBe('surprised')
  })

  it('puts care before happiness, as Shiro worries first', () => {
    expect(inferReplyEmotion('เปิดให้แล้วค่ะ อย่าลืมพักด้วยนะคะ')).toBe('concerned')
  })

  it('does not read "อย่าลืม" or "อย่าง" as anger', () => {
    expect(inferReplyEmotion('อย่าลืมดื่มน้ำนะคะ')).toBe('concerned')
    expect(inferReplyEmotion('ปิดโปรแกรมบางอย่างก่อนค่ะ')).toBeUndefined()
    expect(inferReplyEmotion('อย่าเล่นเกมทั้งคืนสิคะ')).toBe('angry')
  })

  it('returns undefined for a plain reply', () => {
    expect(inferReplyEmotion('GPU ใช้งานอยู่ที่ 28% ค่ะ')).toBeUndefined()
  })
})
