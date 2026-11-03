import { describe, expect, it } from 'vitest'

import { removeEmoji } from './emoji'

describe('removeEmoji', () => {
  it('removes emoji and keeps Thai text and numbers', () => {
    expect(removeEmoji('เปิดให้แล้วค่ะ 😊 แรมเหลือ 0.4 GB 🚀')).toBe('เปิดให้แล้วค่ะ  แรมเหลือ 0.4 GB ')
  })

  it('removes joined, flag, keycap, and skin tone sequences', () => {
    expect(removeEmoji('a👩‍💻b🇹🇭c1️⃣d👍🏽e')).toBe('abc1de')
  })

  it('removes the parts of an emoji that arrive in separate chunks', () => {
    const chunks = ['สวัสดี👩', '‍💻', 'ค่ะ']

    expect(chunks.map(removeEmoji).join('')).toBe('สวัสดีค่ะ')
  })
})
