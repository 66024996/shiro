import type { Tool } from '@xsai/shared-chat'

import { useAssistantModeStore } from '@proj-airi/stage-ui/stores/assistant-mode'
import { rawTool } from '@xsai/tool'

export const gamingModeToolName = 'gaming_mode'

/**
 * Turns Gaming Mode on or off by request, for example "ชิโระ เข้าโหมดเล่นเกม".
 * The tool runs in the leading renderer. The assistant-mode store syncs the change to every window.
 */
export async function gamingModeTools(): Promise<Tool[]> {
  return [
    rawTool({
      name: gamingModeToolName,
      description: [
        'Turn Gaming Mode on or off. Call it every time the user asks to enter or leave Gaming Mode.',
        'Enter: "เข้าโหมดเล่นเกม", "เปิดโหมดเกม". Leave: "ออกจากโหมดเล่นเกม", "ปิดโหมดเกม", "เลิกเล่นเกมแล้ว".',
        'Gaming Mode only changes after this call, so never say it changed without calling it.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'true turns Gaming Mode on. false turns it off.' },
        },
        required: ['enabled'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const { enabled } = input as { enabled: boolean }
        useAssistantModeStore().setGamingMode(enabled)
        return JSON.stringify({ gamingMode: enabled })
      },
    }),
  ]
}
