import { describe, expect, it, vi } from 'vitest'

import { GamingResources } from './resources'

function createResources() {
  const setPriority = vi.fn()
  const fetchMock = vi.fn<typeof fetch>(async input => new Response(String(input).endsWith('/api/ps') ? JSON.stringify({ models: [{ name: 'shiro:latest' }] }) : '{}'))
  const resources = new GamingResources({
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    speechBaseUrl: 'http://127.0.0.1:5052',
    listProcesses: async () => [{ name: 'llama-server.exe', pid: 10 }, { name: 'chrome.exe', pid: 11 }],
    setPriority,
    speechPid: () => 20,
    childPids: async (pid: number) => pid === 20 ? [21] : [],
    fetch: fetchMock,
  })
  return { resources, setPriority, fetchMock }
}

describe('gamingResources', () => {
  it('unloads the Ollama models and lowers the model and speech priorities for a game', async () => {
    const { resources, setPriority, fetchMock } = createResources()

    await resources.setGaming(true)

    const unload = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/generate'))
    expect(JSON.parse(String((unload?.[1] as RequestInit).body))).toEqual({ model: 'shiro:latest', keep_alive: 0 })
    expect(setPriority.mock.calls).toEqual([[10, 'below-normal'], [20, 'below-normal'], [21, 'below-normal']])
  })

  it('gives the normal priority back when Gaming Mode ends', async () => {
    const { resources, setPriority } = createResources()
    await resources.setGaming(true)
    setPriority.mockClear()

    await resources.setGaming(false)

    expect(setPriority.mock.calls).toEqual([[10, 'normal'], [20, 'normal'], [21, 'normal']])
  })

  it('lowers a model process that starts during Gaming Mode once', async () => {
    const { resources, setPriority } = createResources()
    await resources.setGaming(true)
    setPriority.mockClear()

    resources.lowerPriorities([{ name: 'llama-server.exe', pid: 10 }, { name: 'llama-server.exe', pid: 30 }])

    expect(setPriority.mock.calls).toEqual([[30, 'below-normal']])
  })

  // ROOT CAUSE:
  //
  // In Gaming Mode the speech server still held the voice model and used about 6 GB of memory.
  it('turns the speech memory saver on for a game and off after it', async () => {
    const { resources, fetchMock } = createResources()
    const saverBodies = () => fetchMock.mock.calls
      .filter(([url]) => String(url) === 'http://127.0.0.1:5052/v1/system/memory-saver')
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)))

    await resources.setGaming(true)
    await resources.setGaming(false)

    expect(saverBodies()).toEqual([{ enabled: true }, { enabled: false }])
  })

  it('does nothing to priorities outside Gaming Mode', () => {
    const { resources, setPriority } = createResources()

    resources.lowerPriorities([{ name: 'llama-server.exe', pid: 10 }])

    expect(setPriority).not.toHaveBeenCalled()
  })
})
