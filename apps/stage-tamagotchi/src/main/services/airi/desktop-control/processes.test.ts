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
})
