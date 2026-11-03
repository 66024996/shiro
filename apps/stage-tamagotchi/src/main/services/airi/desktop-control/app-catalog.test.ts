import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { matchApps, StartAppCatalog } from './app-catalog'

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
