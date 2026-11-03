import { describe, expect, it } from 'vitest'

import { resolveAssistantRuntimeProfile, resolveToolPermission } from './assistant-runtime'

describe('assistant runtime profile', () => {
  it('defaults to a gaming mode when the profile enables it', () => {
    const runtime = resolveAssistantRuntimeProfile({
      name: 'ชิโระ',
      displayName: 'ชิโระ',
      wakeWord: 'ชิโระ',
      defaultMode: 'gaming',
      gamingMode: true,
      localFirst: true,
    })

    expect(runtime.mode).toBe('gaming')
    expect(runtime.state).toBe('gaming')
    expect(runtime.toolPolicy.browser).toBe('confirmation')
  })

  it('uses Shiro\'s playful yandere personality by default', () => {
    const runtime = resolveAssistantRuntimeProfile()

    expect(runtime.name).toBe('Shiro')
    expect(runtime.personality).toBe('ยันเดเระขี้เล่น')
  })

  it('keeps the runtime in normal mode when gaming is disabled', () => {
    const runtime = resolveAssistantRuntimeProfile({
      gamingMode: false,
      localFirst: true,
    })

    expect(runtime.mode).toBe('normal')
    expect(runtime.state).toBe('idle')
    expect(runtime.toolPolicy.browser).toBe('confirmation')
  })

  it('switches to permission mode when a tool requires review', () => {
    const runtime = resolveAssistantRuntimeProfile({
      state: 'permission',
      localFirst: true,
      gamingMode: true,
    })

    expect(runtime.state).toBe('permission')
    expect(resolveToolPermission('browser', runtime)).toBe('confirmation')
  })

  it('honors permission-review mode as an explicit runtime state', () => {
    const runtime = resolveAssistantRuntimeProfile({
      defaultMode: 'permission-review',
      gamingMode: true,
      localFirst: true,
    })

    expect(runtime.mode).toBe('permission-review')
    expect(runtime.state).toBe('permission')
  })

  it('blocks unsafe system access while allowing safe local-first helper actions', () => {
    expect(resolveToolPermission('shell', { localFirst: true })).toBe('blocked')
    expect(resolveToolPermission('filesystem', { localFirst: true })).toBe('blocked')
    expect(resolveToolPermission('browser', { localFirst: true, gamingMode: false })).toBe('confirmation')
    expect(resolveToolPermission('reminder', { localFirst: true })).toBe('safe')
  })
})
