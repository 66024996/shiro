import { afterEach, describe, expect, it, vi } from 'vitest'

import { getOllamaStatus } from './ollama-status'

describe('getOllamaStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns installed local model names', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [{ name: 'shiro-gemma-fs:latest' }, { name: 'qwen3:4b' }],
    }), { status: 200 })))

    await expect(getOllamaStatus()).resolves.toEqual({
      state: 'available',
      models: ['shiro-gemma-fs:latest', 'qwen3:4b'],
    })
  })

  it('reports an unavailable local server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Connection refused')
    }))

    await expect(getOllamaStatus()).resolves.toEqual({
      state: 'unavailable',
      models: [],
      message: 'Connection refused',
    })
  })

  it('rejects an invalid model list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [{ id: 'qwen3:4b' }] }), { status: 200 })))

    await expect(getOllamaStatus()).resolves.toMatchObject({
      state: 'unavailable',
      models: [],
      message: 'Ollama returned an invalid model list.',
    })
  })
})
