import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { matchApps, resolveAppQuery, StartAppCatalog } from './app-catalog'

const apps = [
  { name: 'Visual Studio Code', appId: 'Microsoft.VisualStudioCode' },
  { name: 'Google Chrome', appId: 'Chrome' },
  { name: 'Discord', appId: 'com.squirrel.Discord.Discord' },
  { name: 'Steam', appId: '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\\Steam\\Steam.exe' },
  { name: 'Steam Support Center', appId: 'http://support.steampowered.com/' },
  { name: 'Uninstall Discord Helper', appId: 'discord-uninstall' },
  { name: 'Microsoft Word', appId: 'word' },
  { name: 'Microsoft Excel', appId: 'excel' },
]

describe('matchApps', () => {
  it.each([
    ['VS Code', 'Visual Studio Code'],
    ['vscode', 'Visual Studio Code'],
    ['โครม', 'Google Chrome'],
    ['discord', 'Discord'],
    ['ดิสคอร์ด', 'Discord'],
    ['steam', 'Steam'],
    ['word', 'Microsoft Word'],
  ])('opens %s as %s', (query, expected) => {
    const result = matchApps(query, apps)
    expect(result.status).toBe('opened')
    expect(result.status === 'opened' && result.app.name).toBe(expected)
  })

  // ROOT CAUSE:
  //
  // Speech recognition heard "คิดเลข" as "คิดเล็ก". Only an exact alias matched, so the app was not found,
  // and the model guessed another app.
  it.each(['คิดเล็ก', 'เครื่องคิดเล็ก', 'คิดเลข'])('opens Calculator for the misheard name %s', (query) => {
    const result = matchApps(query, [...apps, { name: 'Calculator', appId: 'Microsoft.WindowsCalculator' }])
    expect(result.status === 'opened' && result.app.name).toBe('Calculator')
  })

  it('does not guess an alias for an unrelated Thai name', () => {
    expect(matchApps('โฟโต้ช็อป', apps).status).not.toBe('opened')
  })

  it('asks the user to choose when two apps match equally', () => {
    const result = matchApps('microsoft', apps)
    expect(result.status).toBe('ambiguous')
    expect(result.status === 'ambiguous' && result.candidates.map(app => app.name)).toEqual(['Microsoft Word', 'Microsoft Excel'])
  })

  it('never opens a web link from the Start menu', () => {
    expect(matchApps('steam support center', apps).status).not.toBe('opened')
  })

  it('reports a missing app', () => {
    expect(matchApps('photoshop', apps)).toEqual({ status: 'not-found', suggestions: [] })
  })
})

describe('resolveAppQuery', () => {
  // ROOT CAUSE:
  //
  // The user said "เปิดคิดเล็กให้หน่อย" (a misheard "คิดเลข"). The chat history held an older turn where that
  // phrase opened VS Code, so the model asked for "VS Code" again, and the wrong app opened.
  it('uses the app that the user named when the model asks for another app', () => {
    expect(resolveAppQuery('VS Code', 'เปิดคิดเล็กให้หน่อย')).toBe('calculator')
  })

  it.each([
    ['VS Code', 'เปิดวีเอสโค้ดให้หน่อย'],
    ['Calculator', 'เปิดเครื่องคิดเลขหน่อย'],
    ['Discord', 'เปิด discord ให้หน่อย'],
    ['Photoshop', 'เปิดโปรแกรมแต่งรูปให้หน่อย'],
    ['Word', 'เปิดไฟล์รายงานใน Word'],
  ])('keeps the model name %s for "%s"', (name, userText) => {
    expect(resolveAppQuery(name, userText)).toBe(name)
  })

  it('keeps the model name when the user names two apps', () => {
    expect(resolveAppQuery('Discord', 'เปิดดิสคอร์ดกับสตีมให้หน่อย')).toBe('Discord')
  })
})

describe.runIf(process.platform === 'win32')('startAppCatalog on Windows', () => {
  it('lists Start menu apps and caches the list', async () => {
    let now = 0
    const catalog = new StartAppCatalog({ now: () => now })
    const first = await catalog.list()
    now = 1000
    expect(first.length).toBeGreaterThan(0)
    expect(await catalog.list()).toBe(first)
  }, 30_000)
})
