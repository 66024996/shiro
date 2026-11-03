import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { defineStore } from 'pinia'

import { computerUseTools } from './builtin/computer-use'
import { desktopControlToolNames, desktopControlTools } from './builtin/desktop-control'
import { imageJournalTools } from './builtin/image-journal'
import { memoryTools } from './builtin/memory'
import { weatherTools } from './builtin/weather'
import { widgetsTools } from './builtin/widgets'

export const computerUseToolReferences = [
  { name: 'computer_use' },
  { name: 'computer_use_read_image' },
] satisfies ChatToolReference[]

/**
 * Memory tools are active in every request, because the user can ask Shiro to remember or
 * forget something at any time. The model decides when to call them.
 */
export const memoryToolReferences = [
  { name: 'memory_remember' },
  { name: 'memory_forget' },
] satisfies ChatToolReference[]

/**
 * Computer-control tools are active in every request, so a voice command such as
 * "open VS Code" works at once. The main process asks the user before risky actions.
 */
export const desktopControlToolReferences = desktopControlToolNames.map(name => ({ name })) satisfies ChatToolReference[]

const alwaysActiveToolNames = new Set([...memoryToolReferences, ...desktopControlToolReferences].map(reference => reference.name))

export const useTamagotchiBuiltinToolsStore = defineStore('tamagotchi-builtin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const toolIdPrefix = 'tamagotchi:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    const tools = (await Promise.all([
      imageJournalTools(),
      widgetsTools(),
      weatherTools(),
      computerUseTools(),
      memoryTools(),
      desktopControlTools(),
    ])).flat()

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      defaultActive: alwaysActiveToolNames.has(tool.function.name),
      requiresExplicitSelection: computerUseToolReferences.some(reference => reference.name === tool.function.name),
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  return { refresh }
}, {
  synced: {
    actions: ['refresh'],
    state: false,
  },
})
