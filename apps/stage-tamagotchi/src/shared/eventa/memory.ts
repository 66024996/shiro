import { defineInvokeEventa } from '@moeru/eventa'

/**
 * How long Shiro keeps a memory.
 *
 * - `long-term`: kept until the user asks Shiro to forget it.
 * - `temporary`: removed after `expiresAt`, for example today's tasks or the current game.
 */
export type MemoryKind = 'long-term' | 'temporary'

/** One fact that the user asked Shiro to remember. The main process owns the stored copy. */
export interface MemoryEntry {
  id: string
  kind: MemoryKind
  text: string
  /** Unix time in milliseconds. */
  createdAt: number
  /** Unix time in milliseconds. `null` for long-term memories. */
  expiresAt: number | null
}

export interface MemoryRememberRequest {
  kind: MemoryKind
  text: string
  /**
   * Lifetime of a temporary memory. The main process ignores it for long-term memories.
   *
   * @default 24
   */
  ttlHours?: number
}

/** Lists active memories, oldest first. Expired temporary memories are removed before the list returns. */
export const memoryList = defineInvokeEventa<MemoryEntry[]>('eventa:invoke:shiro:memory:list')
/** Stores one memory and returns it. Rejects invalid input and a full store. */
export const memoryRemember = defineInvokeEventa<MemoryEntry, MemoryRememberRequest>('eventa:invoke:shiro:memory:remember')
/** Removes memories by ID and returns the removed entries. Unknown IDs are ignored. */
export const memoryForget = defineInvokeEventa<MemoryEntry[], { ids: string[] }>('eventa:invoke:shiro:memory:forget')
