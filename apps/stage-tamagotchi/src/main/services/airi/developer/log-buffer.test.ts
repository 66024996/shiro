import { describe, expect, it } from 'vitest'

import { LogBuffer } from './log-buffer'

describe('logBuffer', () => {
  it('removes terminal colors, splits lines, and keeps only the newest lines', () => {
    const buffer = new LogBuffer(3)

    buffer.push('\u001B[34m[log]\u001B[39m one\ntwo')
    buffer.push('three')
    buffer.push('four\n')

    expect(buffer.snapshot()).toEqual(['two', 'three', 'four'])
    expect(new LogBuffer().snapshot()).toEqual([])
  })
})
