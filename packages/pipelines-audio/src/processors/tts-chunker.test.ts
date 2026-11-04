// packages/pipelines-audio/src/processors/tts-chunker.test.ts

import type { TtsInputChunk } from './tts-chunker'

import { describe, expect, it } from 'vitest'

import { chunkTtsInput, isProbablyAngleTag, processNarrative } from './tts-chunker'

async function collectChunks(text: string): Promise<TtsInputChunk[]> {
  const chunks: TtsInputChunk[] = []
  for await (const chunk of chunkTtsInput(text))
    chunks.push(chunk)
  return chunks
}

describe('chunkTtsInput boost', () => {
  // ROOT CAUSE:
  //
  // Boost chunks ended at any soft punctuation regardless of length, so "嗯，那就好，" became
  // "嗯，" plus "那就好，". A TTS request costs the same however short its text, so those
  // fragments delayed the audio boost exists to bring forward.
  it('does not yield boost fragments shorter than the minimum word count', async () => {
    const chunks = await collectChunks('嗯，那就好，听你说没事我心里就踏实了。倒是你，现在都两点了，')

    expect(chunks[0]?.text).not.toBe('嗯，')
    expect(chunks[0]?.text.startsWith('嗯，那就好，')).toBe(true)
    for (const chunk of chunks.filter(chunk => chunk.reason === 'boost'))
      expect(chunk.words).toBeGreaterThanOrEqual(4)
  })

  it('still yields a long opening clause early at soft punctuation', async () => {
    const chunks = await collectChunks('I really want to tell you something, and then I will say more.')

    expect(chunks[0]).toMatchObject({ text: 'I really want to tell you something,', reason: 'boost' })
  })
})

describe('chunkTtsInput grapheme clusters', () => {
  // ROOT CAUSE:
  //
  // The chunker skipped every grapheme cluster longer than one code unit, to drop emoji.
  // A Thai consonant with a vowel or tone mark is such a cluster, so "สวัสดีค่ะ" became "สสะ"
  // and the speech voice read nonsense.
  it('keeps Thai letters that carry vowel or tone marks', async () => {
    const chunks = await collectChunks('สวัสดีค่ะ คุณกลับมาแล้วนะ ไปทำอะไรกันดีไหมคะ?')

    expect(chunks.map(chunk => chunk.text).join(' ')).toBe('สวัสดีค่ะ คุณกลับมาแล้วนะ ไปทำอะไรกันดีไหมคะ?')
  })

  it('still drops multi code unit emoji', async () => {
    const chunks = await collectChunks('Hello there 👍🏽 my friend.')

    expect(chunks.map(chunk => chunk.text).join(' ')).not.toContain('👍')
  })
})

describe('chunkTtsInput Thai phrase breaks', () => {
  // ROOT CAUSE:
  //
  // Thai replies use spaces between phrases instead of punctuation, so a whole reply became one chunk.
  // Speech then started only after the model finished the reply, about 47 seconds for a short story.
  it('ends an opening Thai chunk at a space once it is long enough', async () => {
    const reply = 'สวัสดีค่ะ วันนี้คุณดูเหนื่อยมากเลยนะคะ อย่าลืมพักผ่อนบ้าง ชิโระเป็นห่วงคุณจริง ๆ นะคะ'
    const chunks = await collectChunks(reply)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]?.reason).toBe('boost')
    expect(chunks.map(chunk => chunk.text).join(' ')).toBe(reply)
  })

  it('keeps English words together', async () => {
    const chunks = await collectChunks('I really want to tell you something and then I will say more')

    expect(chunks).toHaveLength(1)
  })
})

describe('tTS Chunker Logic Cleanup', () => {
  describe('isProbablyAngleTag Heuristics', () => {
    it('should identify narrative tags', () => {
      expect(isProbablyAngleTag(0, '<sigh>')).toBe(true)
    })

    it('should skip code patterns like generics', () => {
      expect(isProbablyAngleTag(4, 'List<String>')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<y')).toBe(false)
    })
  })

  describe('processNarrative Function', () => {
    const options = { stripNarrative: true }

    it('should strip standard bracketed narrative', () => {
      expect(processNarrative('Hello [sighs] world', options)).toBe('Hello  world')
      expect(processNarrative('<<tag>>', options)).toBe('')
    })

    it('should restore stripping for CJK brackets', () => {
      expect(processNarrative('你好（叹气）世界', options)).toBe('你好世界')
      expect(processNarrative('【动作】你好', options)).toBe('你好')
    })

    it('should fix asterisk bullet leakage', () => {
      expect(processNarrative('* item 1', options)).toBe('* item 1')
      expect(processNarrative('*bold text*', options)).toBe('')
      expect(processNarrative('a*b', options)).toBe('a*b')
    })

    it('should handle complex nesting correctly', () => {
      expect(processNarrative('Normal (nested [action]) text', options)).toBe('Normal  text')
    })

    it('should handle open bracket correctly', () => {
      expect(processNarrative('Version (beta', options)).toBe('Version (beta')
    })

    it('should handle valid narrative tag', () => {
      expect(processNarrative('Hello,<laugh>', options)).toBe('Hello,')
      expect(processNarrative('Hello<laugh>', options)).toBe('Hello')
      expect(processNarrative('<laughs>Hello', options)).toBe('Hello')
      expect(processNarrative('Hello<laughs>', options)).toBe('Hello')
      expect(processNarrative('你好<laughs>', options)).toBe('你好')
      expect(processNarrative('List<T>', options)).toBe('List<T>')
    })

    it('should preserve code literals in keepNarrativeText mode', () => {
      const keepOptions = { stripNarrative: true, keepNarrativeText: true }
      expect(processNarrative('Value is List<String> [action]', keepOptions)).toContain('List<String>')
      expect(processNarrative('x < y (sigh)', keepOptions)).toContain('x < y')
      expect(processNarrative('price<limit', keepOptions)).toContain('price<limit')
    })

    it('should be case-insensitive for narrative tags', () => {
      const options = { stripNarrative: true }
      expect(processNarrative('Hello<LAUGHs>', options)).toBe('Hello')
      expect(processNarrative('abc<Action>', options)).toBe('abc')
      expect(processNarrative('List<String>', options)).toBe('List<String>')
    })
  })

  describe('isProbablyAngleTag Stream Prefix Handling', () => {
    it('should identify partial prefixes of narrative keywords', () => {
      expect(isProbablyAngleTag(5, 'hello<sm')).toBe(true)
      expect(isProbablyAngleTag(5, 'hello<la')).toBe(true) // laugh 的前缀
    })

    it('should not identify non-narrative prefixes as tags', () => {
      expect(isProbablyAngleTag(4, 'List<Str')).toBe(false)
    })
  })

  describe('edge Cases test', () => {
    it('should not treat single-letter operands as narrative prefixes', () => {
      expect(isProbablyAngleTag(1, 'a<b')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<s')).toBe(false)
    })

    it('should support non-CJK Unicode letters as tag context', () => {
      expect(isProbablyAngleTag(4, 'café<laugh>')).toBe(true)
      expect(isProbablyAngleTag(6, 'привет<sigh>')).toBe(true)
    })
  })
})
