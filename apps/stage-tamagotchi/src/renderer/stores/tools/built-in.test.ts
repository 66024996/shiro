import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useTamagotchiBuiltinToolsStore', async () => {
  const { useTamagotchiBuiltinToolsStore } = await import('./built-in')
  const { desktopControlToolNames } = await import('./builtin/desktop-control')

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers built-in executors and keeps memory and desktop control tools always active', async () => {
    const toolsStore = useLlmToolsStore()

    await useTamagotchiBuiltinToolsStore().refresh()

    expect(toolsStore.activeTools.map(tool => tool.function.name)).toEqual(['memory_remember', 'memory_forget', ...desktopControlToolNames, 'gaming_mode'])
    expect(toolsStore.tools.map(tool => ({
      id: tool.id,
      defaultActive: tool.defaultActive,
    }))).toEqual([
      { id: 'tamagotchi:computer_use', defaultActive: false },
      { id: 'tamagotchi:computer_use_read_image', defaultActive: false },
      { id: 'tamagotchi:memory_remember', defaultActive: true },
      { id: 'tamagotchi:memory_forget', defaultActive: true },
      ...desktopControlToolNames.map(name => ({ id: `tamagotchi:${name}`, defaultActive: true })),
      { id: 'tamagotchi:gaming_mode', defaultActive: true },
    ])
    expect(toolsStore.tools.filter(tool => tool.requiresExplicitSelection).map(tool => tool.function.name)).toEqual(['computer_use', 'computer_use_read_image'])
    expect(toolsStore.getToolsByNames('get_weather', 'stage_widgets', 'image_journal')).toEqual([])
  })
})
