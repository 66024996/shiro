import type { AvatarStateSignals } from './avatar-state'

import { describe, expect, it } from 'vitest'

import { resolveAvatarState } from './avatar-state'

const quiet: AvatarStateSignals = {
  permissionPending: false,
  error: false,
  listening: false,
  speaking: false,
  thinking: false,
  gaming: false,
}

describe('resolveAvatarState', () => {
  it('follows a voice command from listening to idle', () => {
    expect(resolveAvatarState({ ...quiet, listening: true })).toBe('listening')
    expect(resolveAvatarState({ ...quiet, thinking: true })).toBe('thinking')
    expect(resolveAvatarState({ ...quiet, speaking: true })).toBe('speaking')
    expect(resolveAvatarState(quiet)).toBe('idle')
  })

  it('shows the reply emotion while speaking and after the reply', () => {
    expect(resolveAvatarState({ ...quiet, speaking: true, emotion: 'concerned' })).toBe('concerned')
    expect(resolveAvatarState({ ...quiet, emotion: 'happy' })).toBe('happy')
  })

  it('shows thinking over an old reply emotion while a new request runs', () => {
    expect(resolveAvatarState({ ...quiet, thinking: true, emotion: 'sad' })).toBe('thinking')
  })

  it('puts permission and then error before every other state', () => {
    const busy = { ...quiet, listening: true, speaking: true, thinking: true, gaming: true, emotion: 'happy' as const }

    expect(resolveAvatarState({ ...busy, permissionPending: true, error: true })).toBe('permission')
    expect(resolveAvatarState({ ...busy, error: true })).toBe('error')
  })

  it('rests in the gaming state during Gaming Mode', () => {
    expect(resolveAvatarState({ ...quiet, gaming: true })).toBe('gaming')
  })
})
