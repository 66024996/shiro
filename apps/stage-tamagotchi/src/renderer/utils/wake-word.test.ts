import { describe, expect, it } from 'vitest'

import { resolveWakeWordInput } from './wake-word'

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
