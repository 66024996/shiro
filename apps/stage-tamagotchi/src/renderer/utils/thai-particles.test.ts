import { describe, expect, it } from 'vitest'

import { createThaiParticleTransform, fixThaiPoliteParticles } from './thai-particles'

describe('fixThaiPoliteParticles', () => {
  // ROOT CAUSE:
  //
  // The local model wrote "พักผ่อนก่อนนะค่ะ" and "อยู่ในบ้านหรือเปล่าค่ะ". After "นะ" and question words,
  // the particle is "คะ".
  it.each([
    ['ชิโระจะเตือนให้พักก่อนนะค่ะ', 'ชิโระจะเตือนให้พักก่อนนะคะ'],
    ['คุณอยู่ในบ้านหรือเปล่าค่ะ', 'คุณอยู่ในบ้านหรือเปล่าคะ'],
    ['วันนี้เป็นไงบ้างค่ะ?', 'วันนี้เป็นไงบ้างคะ?'],
    ['อยากกินอะไรค่ะ บอกชิโระได้นะค่ะ', 'อยากกินอะไรคะ บอกชิโระได้นะคะ'],
    ['ต้องการอีกไหมค่ะ', 'ต้องการอีกไหมคะ'],
  ])('fixes %s', (wrong, right) => {
    expect(fixThaiPoliteParticles(wrong)).toBe(right)
  })

  it('keeps correct statements and questions', () => {
    for (const text of ['เปิดเครื่องคิดเลขให้แล้วค่ะ', 'ไปพักก่อนนะคะ', 'ได้ค่ะ', 'แรมเหลือ 2 GB ค่ะ', 'ชิโระชอบนะคะ'])
      expect(fixThaiPoliteParticles(text)).toBe(text)
  })
})

describe('createThaiParticleTransform', () => {
  it('fixes a particle that spans two chunks and keeps all text', () => {
    const transform = createThaiParticleTransform()
    const chunks = ['อากาศดีแบบนี้ ออกไปเดินเล่นบ้างก็ดีนะค', '่ะ คุณอยู่ในบ้านหรือเปล่า', 'ค่ะ']
    const output = chunks.map(chunk => transform.push(chunk)).join('') + transform.flush()

    expect(output).toBe('อากาศดีแบบนี้ ออกไปเดินเล่นบ้างก็ดีนะคะ คุณอยู่ในบ้านหรือเปล่าคะ')
  })

  it('returns nothing more after a flush', () => {
    const transform = createThaiParticleTransform()
    expect(transform.push('สวัสดีค่ะ') + transform.flush()).toBe('สวัสดีค่ะ')
    expect(transform.flush()).toBe('')
  })
})
