import type { AppCandidate, AppOpenResult } from '../../../../shared/eventa/desktop-control'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { object, pipe, string, transform } from 'valibot'

import { canonicalThaiForm, editDistance } from '../../../../shared/utils/thai-text-match'
import { powerShellList, queryPowerShellJson } from './windows-shell'

/** Spoken or short names mapped to words in the Start menu name. Keys are normalized. */
const APP_ALIASES: Record<string, string> = {
  'vscode': 'visual studio code',
  'vs code': 'visual studio code',
  'code': 'visual studio code',
  'วีเอสโค้ด': 'visual studio code',
  'chrome': 'google chrome',
  'โครม': 'google chrome',
  'edge': 'microsoft edge',
  'explorer': 'file explorer',
  'ไฟล์': 'file explorer',
  'cmd': 'command prompt',
  'terminal': 'terminal',
  'เทอร์มินัล': 'terminal',
  'powershell': 'windows powershell',
  'เครื่องคิดเลข': 'calculator',
  'คิดเลข': 'calculator',
  'แคลคูเลเตอร์': 'calculator',
  'calc': 'calculator',
  'โน้ตแพด': 'notepad',
  'ตั้งค่า': 'settings',
  'ดิสคอร์ด': 'discord',
  'สตีม': 'steam',
  'สปอติฟาย': 'spotify',
}

/** Words in a Start menu name that mark a helper entry, not the app itself. */
const HELPER_WORDS = /\b(?:uninstall|readme|help|support|documentation|manual|release notes|website)\b/i

const THAI_LETTER = /\p{Script=Thai}/u

const MATCH_THRESHOLD = 50
const MAX_CANDIDATES = 5

export function normalizeAppName(name: string) {
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim()
}

/**
 * Returns the English app name for a spoken or short name, for example "เครื่องคิดเลข" to "calculator".
 *
 * A Thai name also matches an alias that sounds alike, because speech recognition changes tone marks and
 * final letters. For example, it heard "คิดเลข" as "คิดเล็ก". The match must be unique, or no alias is used.
 */
export function appAliasOf(normalizedName: string): string | undefined {
  const exact = APP_ALIASES[normalizedName]
  if (exact || !THAI_LETTER.test(normalizedName))
    return exact

  const query = canonicalThaiForm(normalizedName)
  const matches = new Set<string>()
  for (const [alias, target] of Object.entries(APP_ALIASES)) {
    const key = canonicalThaiForm(alias)
    if (!THAI_LETTER.test(key) || key.length < 4)
      continue
    if (editDistance(query, key) <= (key.length >= 8 ? 2 : 1))
      matches.add(target)
  }
  return matches.size === 1 ? [...matches][0] : undefined
}

/** Aliases that are also common words, so they do not name an app inside a sentence. */
const GENERIC_ALIASES = new Set(['ไฟล์', 'ตั้งค่า', 'code', 'terminal', 'explorer', 'เทอร์มินัล'])

function containsSoundAlike(text: string, alias: string) {
  if (text.includes(alias))
    return true
  const key = canonicalThaiForm(alias)
  if (key.length < 5)
    return false
  const canonicalText = canonicalThaiForm(text)
  const maxDistance = key.length >= 8 ? 2 : 1
  for (let length = key.length - 1; length <= key.length + 1; length++) {
    for (let start = 0; start + length <= canonicalText.length; start++) {
      if (editDistance(canonicalText.slice(start, start + length), key) <= maxDistance)
        return true
    }
  }
  return false
}

/**
 * Returns the English app name when the text names exactly one known app, for example "calculator" for
 * "เปิดคิดเล็กให้หน่อย". A Thai name also matches when it sounds alike. Common words such as "ไฟล์" do not count.
 */
export function findSpokenApp(text: string): string | undefined {
  const normalized = normalizeAppName(text)
  const padded = ` ${normalized} `
  const targets = new Set<string>()
  for (const [alias, target] of Object.entries(APP_ALIASES)) {
    if (GENERIC_ALIASES.has(alias))
      continue
    const found = THAI_LETTER.test(alias) ? containsSoundAlike(normalized, alias) : padded.includes(` ${alias} `)
    if (found)
      targets.add(target)
  }
  return targets.size === 1 ? [...targets][0] : undefined
}

/**
 * Picks the app name to open. The model can replace a misheard name with an app from the chat history,
 * so the user's words win when they name a known app that differs from the model's name.
 */
export function resolveAppQuery(name: string, userText?: string): string {
  if (!userText)
    return name
  const requested = normalizeAppName(name)
  if (requested && normalizeAppName(userText).includes(requested))
    return name
  const spoken = findSpokenApp(userText)
  if (!spoken || (appAliasOf(requested) ?? requested) === spoken)
    return name
  return spoken
}

function scoreName(name: string, query: string) {
  if (name === query)
    return 100
  if (name.startsWith(query))
    return 80
  const words = query.split(' ')
  if (words.every(word => name.split(' ').includes(word)))
    return 60
  if (name.includes(query))
    return 50
  return 0
}

/**
 * Ranks Start menu apps for a spoken name. The result is `opened` only when one app is
 * clearly the best match. Otherwise the caller asks the user to choose.
 */
export function matchApps(query: string, apps: AppCandidate[]): AppOpenResult {
  const normalized = normalizeAppName(query)
  if (!normalized)
    return { status: 'not-found', suggestions: [] }
  const queries = [...new Set([normalized, appAliasOf(normalized)].filter((value): value is string => !!value))]
  const queryMentionsHelper = HELPER_WORDS.test(normalized)

  const ranked = apps
    .filter(app => !/^https?:/i.test(app.appId))
    .map((app) => {
      const name = normalizeAppName(app.name)
      let score = Math.max(...queries.map(candidate => scoreName(name, candidate)))
      if (!queryMentionsHelper && HELPER_WORDS.test(name))
        score -= 30
      return { app, score }
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.app.name.length - right.app.name.length)

  const [best, second] = ranked
  if (!best || best.score < MATCH_THRESHOLD)
    return { status: 'not-found', suggestions: ranked.slice(0, MAX_CANDIDATES).map(entry => entry.app) }
  if (second && second.score === best.score && normalizeAppName(second.app.name) !== normalizeAppName(best.app.name))
    return { status: 'ambiguous', candidates: ranked.filter(entry => entry.score === best.score).slice(0, MAX_CANDIDATES).map(entry => entry.app) }
  return { status: 'opened', app: best.app }
}

const startAppsSchema = pipe(
  powerShellList(object({ Name: string(), AppID: string() })),
  transform(apps => apps.map(app => ({ name: app.Name, appId: app.AppID }))),
)

/** Start menu apps, including Store apps and games. The list is cached for one minute. */
export class StartAppCatalog {
  private cached: { apps: AppCandidate[], expiresAt: number } | undefined

  constructor(private readonly options: { cacheMs?: number, now?: () => number } = {}) {}

  async list(): Promise<AppCandidate[]> {
    const now = this.options.now?.() ?? Date.now()
    if (this.cached && this.cached.expiresAt > now)
      return this.cached.apps
    const apps = await queryPowerShellJson('ConvertTo-Json -InputObject @(Get-StartApps | Select-Object Name, AppID) -Compress', startAppsSchema)
    this.cached = { apps, expiresAt: now + (this.options.cacheMs ?? 60_000) }
    return apps
  }

  /** Finds an app by name and opens it without arguments when the match is clear. */
  async open(query: string): Promise<AppOpenResult> {
    const result = matchApps(query, await this.list())
    if (result.status === 'opened')
      await launchStartApp(result.app.appId)
    return result
  }
}

/**
 * Opens a Start menu entry through the shell, as a click on the Start menu does.
 * The app ID is one item from `Get-StartApps`, so the model cannot pass a path or arguments.
 */
async function launchStartApp(appId: string) {
  const systemRoot = process.env.SystemRoot
  if (!systemRoot)
    throw new Error('The Windows system directory is not available.')
  // Explorer returns exit code 1 even when the app starts, so only a spawn failure is an error.
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(resolve(systemRoot, 'explorer.exe'), [`shell:AppsFolder\\${appId}`], { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolvePromise()
    })
  })
}
