import { describe, expect, it, vi } from 'vitest'

import { useAiriRuntimePrompt } from './use-airi-runtime-prompt'

const i18nMock = vi.hoisted(() => ({
  hasTranslation: vi.fn<(key: string, locale: string) => boolean>(),
  locale: { value: 'en' },
  messages: {} as Record<string, string>,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: i18nMock.locale,
    t: (key: string) => i18nMock.messages[key] ?? key,
    te: (key: string, currentLocale: string) => i18nMock.hasTranslation(key, currentLocale),
  }),
}))

describe('useAiriRuntimePrompt', () => {
  it('returns no prompt for a locale that still uses the combined prompt', () => {
    i18nMock.hasTranslation.mockReturnValue(false)

    expect(useAiriRuntimePrompt().value).toBe('')
  })

  it('assembles the emotion and emoji prompt for a split locale', () => {
    i18nMock.hasTranslation.mockReturnValue(true)

    const prompt = useAiriRuntimePrompt().value

    expect(prompt).toContain('base.prompt.emotion')
    expect(prompt).toContain('base.prompt.suffix')
    expect(prompt).toContain('base.prompt.emoji')
    expect(prompt).toContain('- happy (Emotion for feeling')
  })

  it('leaves out the emotion tokens and list when the locale emotion prompt is empty', () => {
    i18nMock.hasTranslation.mockReturnValue(true)
    i18nMock.messages = { 'base.prompt.emotion': '' }

    const prompt = useAiriRuntimePrompt().value
    i18nMock.messages = {}

    expect(prompt).toBe('base.prompt.suffix\n\nbase.prompt.emoji')
  })
})
