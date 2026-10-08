/**
 * Language used on first launch, when the user has not chosen one yet.
 *
 * NOTICE: Shiro. Upstream AIRI falls back to `navigator.language` (OS locale).
 * Shiro is a Thai-first assistant, so a fresh install starts in Thai regardless of
 * the OS language. A language the user picked is still respected (see issue #1658).
 */
export const DEFAULT_LANGUAGE = 'th'
