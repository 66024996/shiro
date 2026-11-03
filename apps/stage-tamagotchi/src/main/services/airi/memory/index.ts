import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { MemoryStore } from './store'

import { defineInvokeHandler } from '@moeru/eventa'

import { memoryForget, memoryList, memoryRemember } from '../../../../shared/eventa/memory'

export { MemoryStore } from './store'

/** Serves the memory contracts to every renderer through the global IPC context. */
export function setupMemoryService(context: ReturnType<typeof createContext>['context'], store: MemoryStore) {
  defineInvokeHandler(context, memoryList, () => store.list())
  defineInvokeHandler(context, memoryRemember, request => store.remember(request))
  defineInvokeHandler(context, memoryForget, request => store.forget(request))
}
