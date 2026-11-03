import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { createTachieZip, readTachieZipImages } from './tachie-builder'

describe('readTachieZipImages', () => {
  it('returns emotion images from a wrapped archive and skips other files', async () => {
    const archive = zipSync({
      'Shiro/neutral.png': strToU8('neutral'),
      'Shiro/Happy.PNG': strToU8('happy'),
      'Shiro/readme.txt': strToU8('notes'),
    })

    const images = await readTachieZipImages(new Blob([archive]))

    expect(Object.keys(images).sort()).toEqual(['happy', 'neutral'])
    expect(await images.happy?.text()).toBe('happy')
  })

  it('rejects an archive with nested emotion images', async () => {
    const archive = zipSync({ 'a/b/neutral.png': strToU8('neutral') })

    await expect(readTachieZipImages(new Blob([archive]))).rejects.toThrow('nested')
  })
})

describe('createTachieZip', () => {
  it('requires a neutral image', async () => {
    await expect(createTachieZip({ happy: new Blob(['x']) }, 'set')).rejects.toThrow('neutral')
  })
})
