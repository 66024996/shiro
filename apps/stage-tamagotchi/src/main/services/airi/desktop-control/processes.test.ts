import type { ProcessTarget } from '../../../../shared/eventa/desktop-control'

import process from 'node:process'

import { spawn } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { closeProcesses, findCloseTargets, listProcesses, listRunningProcesses } from './processes'

const running = [
  { pid: 10, name: 'chrome', windowTitle: 'YouTube - Google Chrome' },
  { pid: 11, name: 'chrome', windowTitle: '' },
  { pid: 20, name: 'Code', windowTitle: 'airi - Visual Studio Code' },
  { pid: 30, name: 'lsass', windowTitle: '' },
  { pid: 40, name: 'shiro', windowTitle: 'Shiro' },
]

describe('findCloseTargets', () => {
  it('finds every process of an app by alias', () => {
    expect(findCloseTargets({ name: 'โครม' }, running, new Set()).map(item => item.pid)).toEqual([10, 11])
    expect(findCloseTargets({ name: 'VS Code' }, running, new Set()).map(item => item.pid)).toEqual([20])
  })

  it('falls back to a window title', () => {
    expect(findCloseTargets({ name: 'youtube' }, running, new Set()).map(item => item.pid)).toEqual([10])
  })

  it('refuses protected processes and Shiro itself', () => {
    expect(() => findCloseTargets({ name: 'lsass' }, running, new Set())).toThrow('keeps Windows running')
    expect(() => findCloseTargets({ pid: 40 }, running, new Set([40]))).toThrow('does not close itself')
  })

  it('matches a Store app window by its title or by a Thai alias, never the host process by name', () => {
    const withStoreApp = [...running, { pid: 50, name: 'ApplicationFrameHost', windowTitle: 'Calculator', windowHandle: 7001 }]

    expect(findCloseTargets({ name: 'Calculator' }, withStoreApp, new Set())).toEqual([withStoreApp[5]])
    expect(findCloseTargets({ name: 'เครื่องคิดเลข' }, withStoreApp, new Set())).toEqual([withStoreApp[5]])
    expect(() => findCloseTargets({ name: 'ApplicationFrameHost' }, withStoreApp, new Set())).toThrow('No running app')
  })

  it('reports a missing app', () => {
    expect(() => findCloseTargets({ name: 'photoshop' }, running, new Set())).toThrow('No running app')
  })
})

describe.runIf(process.platform === 'win32')('processes on Windows', () => {
  it('lists processes sorted by memory', async () => {
    const list = await listProcesses({ limit: 5 })
    expect(list).toHaveLength(5)
    expect(list[0]!.memoryMiB).toBeGreaterThanOrEqual(list[4]!.memoryMiB)
  }, 30_000)

  it('ends a windowless process only with force', async () => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 60'], { windowsHide: true, stdio: 'ignore' })
    try {
      const target = (await listRunningProcesses()).find(item => item.pid === child.pid)
      expect(target).toBeDefined()

      const polite = await closeProcesses([target!], false)
      expect(polite.stillRunning.map(item => item.pid)).toEqual([child.pid])

      const forced = await closeProcesses([target!], true)
      expect(forced.closed.map(item => item.pid)).toEqual([child.pid])
    }
    finally {
      child.kill()
    }
  }, 40_000)

  // ROOT CAUSE:
  //
  // "ปิดเครื่องคิดเลข" matched ApplicationFrameHost by its window title, because that process owns Store app windows.
  // Closing the process would close every Store app window, and the result reported the host as still running.
  it('closes only the window of a Store app and leaves its host process running', async () => {
    const opened = spawn('explorer.exe', ['shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'], { detached: true, stdio: 'ignore' })
    opened.unref()
    let target: ProcessTarget | undefined
    // While Calculator starts, CalculatorApp can own a "Calculator" window for a moment. Wait for the Store app window.
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      await new Promise(resolveWait => setTimeout(resolveWait, 500))
      const running = await listRunningProcesses()
      target = running.find(item => item.windowHandle !== undefined && findCloseTargets({ name: 'เครื่องคิดเลข' }, running, new Set()).includes(item))
    }
    expect(target?.name).toBe('ApplicationFrameHost')
    expect(target?.windowHandle).toBeTypeOf('number')

    const result = await closeProcesses([target!], true)

    expect(result.closed).toEqual([target])
    // Signal 0 only checks that the host process still exists.
    expect(() => process.kill(target!.pid, 0)).not.toThrow()
  }, 60_000)
})
