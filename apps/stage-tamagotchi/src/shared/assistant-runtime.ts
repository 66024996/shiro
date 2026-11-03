export type AssistantRuntimeMode = 'normal' | 'gaming' | 'permission-review'
export type AssistantRuntimeState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'gaming' | 'permission'
export type AssistantToolPermission = 'safe' | 'confirmation' | 'blocked'

export interface AssistantRuntimeProfile {
  name: string
  displayName: string
  wakeWord: string
  personality: string
  defaultMode: AssistantRuntimeMode
  gamingMode: boolean
  visionDisabledByDefault: boolean
  localFirst: boolean
  mode: AssistantRuntimeMode
  state: AssistantRuntimeState
  toolPolicy: Record<string, AssistantToolPermission>
}

export const DEFAULT_ASSISTANT_TOOL_POLICY: Record<string, AssistantToolPermission> = {
  'shell': 'blocked',
  'app-control': 'blocked',
  'filesystem': 'confirmation',
  'browser': 'confirmation',
  'network': 'confirmation',
  'clipboard': 'confirmation',
  'mediaCapture': 'safe',
  'reminder': 'safe',
}

export function resolveAssistantRuntimeState(
  options: Partial<Pick<AssistantRuntimeProfile, 'mode' | 'gamingMode' | 'state'>> & {
    isListening?: boolean
    isThinking?: boolean
    isSpeaking?: boolean
    pendingPermission?: boolean
  } = {},
): AssistantRuntimeState {
  if (options.pendingPermission || options.state === 'permission')
    return 'permission'

  if (options.isSpeaking || options.state === 'speaking')
    return 'speaking'

  if (options.isListening || options.state === 'listening')
    return 'listening'

  if (options.isThinking || options.state === 'thinking')
    return 'thinking'

  if (options.mode === 'permission-review')
    return 'permission'

  if (options.mode === 'gaming' || options.gamingMode)
    return 'gaming'

  return 'idle'
}

export function resolveAssistantRuntimeProfile(
  profile: Partial<AssistantRuntimeProfile> = {},
): AssistantRuntimeProfile {
  const defaultMode: AssistantRuntimeMode = profile.defaultMode === 'gaming'
    ? 'gaming'
    : profile.defaultMode === 'permission-review'
      ? 'permission-review'
      : 'normal'

  const normalized = {
    name: profile.name ?? 'Shiro',
    displayName: profile.displayName ?? profile.name ?? 'ชิโระ',
    wakeWord: profile.wakeWord ?? 'ชิโระ',
    personality: profile.personality ?? 'ดุแต่รัก ยันเดเระ',
    defaultMode,
    gamingMode: profile.gamingMode ?? true,
    visionDisabledByDefault: profile.visionDisabledByDefault ?? true,
    localFirst: profile.localFirst ?? true,
  }

  const mode: AssistantRuntimeMode = normalized.defaultMode === 'permission-review'
    ? 'permission-review'
    : normalized.gamingMode && normalized.defaultMode === 'gaming'
      ? 'gaming'
      : 'normal'

  const state = resolveAssistantRuntimeState({
    mode,
    gamingMode: normalized.gamingMode,
    state: profile.state,
    isListening: profile.state === 'listening',
    isThinking: profile.state === 'thinking',
    isSpeaking: profile.state === 'speaking',
    pendingPermission: profile.state === 'permission',
  })

  return {
    ...normalized,
    mode,
    state,
    toolPolicy: { ...DEFAULT_ASSISTANT_TOOL_POLICY, ...profile.toolPolicy },
  }
}

export function resolveToolPermission(
  toolName: string,
  profile: Partial<AssistantRuntimeProfile> = {},
): AssistantToolPermission {
  const runtimeProfile = resolveAssistantRuntimeProfile(profile)
  const id = toolName.toLowerCase()
  const toolPolicy = runtimeProfile.toolPolicy ?? DEFAULT_ASSISTANT_TOOL_POLICY

  if (runtimeProfile.localFirst && /^(?:shell|app-control|filesystem|system|process)/.test(id)) {
    return 'blocked'
  }

  if (runtimeProfile.gamingMode && /^(?:browser|clipboard|network|file-write)/.test(id)) {
    return 'confirmation'
  }

  const directPolicy = Object.entries(toolPolicy).find(([key]) => id === key.toLowerCase())?.[1]
  if (directPolicy)
    return directPolicy

  if (/^(?:browser|network|clipboard|filesystem)/.test(id)) {
    return 'confirmation'
  }

  return 'safe'
}

export function describeAssistantRuntime(profile: Partial<AssistantRuntimeProfile> = {}): string {
  const runtimeProfile = resolveAssistantRuntimeProfile(profile)
  return `${runtimeProfile.name} (${runtimeProfile.mode}/${runtimeProfile.state}) — wakeWord=${runtimeProfile.wakeWord}, localFirst=${runtimeProfile.localFirst}, gamingMode=${runtimeProfile.gamingMode}`
}
