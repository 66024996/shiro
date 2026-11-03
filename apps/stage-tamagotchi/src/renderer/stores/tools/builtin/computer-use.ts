import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { rawTool } from '@xsai/tool'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'

/** Creates desktop-only tools. IPC clients are local to the elected renderer executor. */
export async function computerUseTools(): Promise<Tool[]> {
  let invokers: ReturnType<typeof createInvokers> | undefined
  function createInvokers() {
    const { context } = createContext(window.electron.ipcRenderer)
    return {
      run: defineInvoke(context, computerUseRun),
      readImage: defineInvoke(context, computerUseReadImage),
    }
  }
  function client() {
    invokers ??= createInvokers()
    return invokers
  }
  return [
    rawTool({
      name: 'computer_use',
      description: 'Control native desktop apps through allowlisted commands. On Windows, each command needs a separate user approval, and arbitrary shell commands are not supported. Start with argv ["invoke", "--help"] and command-specific help. Pass each CLI argument separately. Use window.list to find a target, app.activate with its window ID, then capture the display. Screenshot output includes originX and originY. Add those offsets to screenshot pixel coordinates before input.clickPoint. Use computer_use_read_image to inspect screenshot artifacts. On macOS, call app.probePermissions before visual tasks and ask the user to grant missing screen-recording permission. A successful command does not prove the intended UI effect.',
      parameters: {
        type: 'object',
        properties: {
          argv: { type: 'array', items: { type: 'string' }, description: 'AUV arguments beginning with invoke, excluding the executable name.' },
        },
        required: ['argv'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const result = await client().run(input as { argv: string[] })
        if (result.exitCode !== 0)
          throw new Error(JSON.stringify(result))
        return JSON.stringify(result)
      },
    }),
    rawTool({
      name: 'computer_use_read_image',
      description: 'View a PNG or JPEG screenshot artifact produced by computer_use. Only files inside AIRI computer-use storage can be read. Select this tool together with computer_use for visual tasks.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute screenshot artifact path returned by computer_use.' } },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async input => [{ type: 'image_url', image_url: { url: await client().readImage(input as { path: string }) } }],
    }),
  ]
}
