import { describe, expect, it } from 'vitest'

import { matchWakeWordPrefix, resolveWakeWordInput } from './wake-word'

describe('resolveWakeWordInput', () => {
  it('passes a command that follows the wake word in the same utterance', () => {
    const state = { commandExpiresAt: 0 }

    expect(resolveWakeWordInput('ชิโระ, เปิดไฟ', 'ชิโระ', state, 100)).toEqual({
      status: 'command',
      text: 'เปิดไฟ',
    })
    expect(state.commandExpiresAt).toBe(0)
  })

  it('waits for the next utterance when the wake word has no command', () => {
    const state = { commandExpiresAt: 0 }

    expect(resolveWakeWordInput('ชิโระ', 'ชิโระ', state, 100)).toEqual({ status: 'activated' })
    expect(resolveWakeWordInput('เปิดไฟ', 'ชิโระ', state, 101)).toEqual({
      status: 'command',
      text: 'เปิดไฟ',
    })
    expect(state.commandExpiresAt).toBe(0)
  })

  it('ignores speech without a wake word', () => {
    const state = { commandExpiresAt: 0 }

    expect(resolveWakeWordInput('เปิดไฟ', 'ชิโระ', state, 100)).toEqual({ status: 'ignored' })
  })

  it('expires the command window after eight seconds', () => {
    const state = { commandExpiresAt: 0 }

    resolveWakeWordInput('ชิโระ', 'ชิโระ', state, 100)

    expect(resolveWakeWordInput('เปิดไฟ', 'ชิโระ', state, 8100)).toEqual({ status: 'ignored' })
  })

  it('uses the entire utterance as the command after activation', () => {
    const state = { commandExpiresAt: 200 }

    expect(resolveWakeWordInput('ไปเปิดหน้าต่าง', 'ชิโระ', state, 199)).toEqual({
      status: 'command',
      text: 'ไปเปิดหน้าต่าง',
    })
  })
})

describe('matchWakeWordPrefix', () => {
  it('accepts the variants that Whisper small heard for ชิโระ, when a space follows', () => {
    for (const heard of ['ชิโล แรมเหลือเท่าไหร่', 'ชีโล เรามเหลือ', 'ชิวโร เปิดเครื่องคิดเล็ก', 'ชิโร เปิดเครื่องคิดเลข', 'ชิโร่'])
      expect(matchWakeWordPrefix(heard, 'ชิโระ'), heard).toBeGreaterThan(0)
  })

  it('rejects other words and close variants without a boundary', () => {
    for (const heard of ['เชี่ยว', 'ชีวิตดีจัง', 'ชิงช้า สวรรค์', 'ชิวโรเปิดไฟ', 'วันนี้เหนื่อย'])
      expect(matchWakeWordPrefix(heard, 'ชิโระ'), heard).toBe(0)
  })

  // ROOT CAUSE:
  //
  // Typhoon ASR writes the command right after the name, as in "ชิโรปิดเครื่องคิดเลข". A variant needed a
  // separator after it, so most voice commands were ignored, and Shiro gave no spoken reply.
  it.each([
    ['ชิโรปิดเครื่องคิดเลขให้หน่อย', 'ปิดเครื่องคิดเลขให้หน่อย'],
    ['ชิโลปิดไฟ', 'ปิดไฟ'],
    ['ชิโร่ เปิดเพลง', 'เปิดเพลง'],
  ])('passes the command when %s has no separator after the name', (heard, command) => {
    expect(resolveWakeWordInput(heard, 'ชิโระ', { commandExpiresAt: 0 }, 0)).toEqual({ status: 'command', text: command })
  })

  it('passes the command after a recognized variant', () => {
    expect(resolveWakeWordInput('ชิโล แรมเหลือเท่าไหร่', 'ชิโระ', { commandExpiresAt: 0 }, 0)).toEqual({ status: 'command', text: 'แรมเหลือเท่าไหร่' })
  })
})

describe('resolveWakeWordInput with a leading filler', () => {
  // ROOT CAUSE:
  //
  // The user said "โอเคชิโร" and Shiro ignored it, because the wake word had to start the utterance.
  it.each([
    ['โอเคชิโร', { status: 'activated' }],
    ['โอเค ชิโระ เปิดเครื่องคิดเลข', { status: 'command', text: 'เปิดเครื่องคิดเลข' }],
    ['เฮ้ชิโระแรมเหลือเท่าไหร่', { status: 'command', text: 'แรมเหลือเท่าไหร่' }],
    ['OK ชิโระ เปิดเพลง', { status: 'command', text: 'เปิดเพลง' }],
  ])('accepts %s', (heard, result) => {
    expect(resolveWakeWordInput(heard, 'ชิโระ', { commandExpiresAt: 0 }, 0)).toEqual(result)
  })

  it('ignores the name later in an ordinary sentence', () => {
    for (const heard of ['แล้วชิโระว่าไง', 'โอเคเจอกัน', 'วันนี้ชิโระน่ารัก'])
      expect(resolveWakeWordInput(heard, 'ชิโระ', { commandExpiresAt: 0 }, 0)).toEqual({ status: 'ignored' })
  })
})
