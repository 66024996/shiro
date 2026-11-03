import type { UserApprovalRequest } from '../user-approval'
import type { AuditEntry } from './audit-log'

import process from 'node:process'

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { StartAppCatalog } from './app-catalog'
import { AuditLog } from './audit-log'
import { FileAccess } from './files'
import { DesktopControlService } from './service'

interface Harness {
  service: DesktopControlService
  approvals: UserApprovalRequest[]
  opened: string[]
  trashed: string[]
  auditEntries: () => Promise<AuditEntry[]>
}

let root: string

beforeAll(async () => {
  // The policy denies AppData, which holds the system temp folder, so the fixture lives in node_modules.
  const parent = join(process.cwd(), 'node_modules', '.vitest-tmp')
  await mkdir(parent, { recursive: true })
  root = await mkdtemp(join(parent, 'service-'))
  await mkdir(join(root, 'Documents'), { recursive: true })
  await writeFile(join(root, 'Documents', 'notes.txt'), 'hello')
  await writeFile(join(root, 'Documents', 'setup.bat'), 'echo hi')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

let harnessCount = 0
function createHarness(options: { approve?: boolean, platform?: NodeJS.Platform } = {}): Harness {
  const approvals: UserApprovalRequest[] = []
  const opened: string[] = []
  const trashed: string[] = []
  const auditPath = join(root, `audit-${harnessCount++}.jsonl`)
  const service = new DesktopControlService({
    approve: async (request) => {
      approvals.push(request)
      return options.approve ?? false
    },
    auditLog: new AuditLog({ path: auditPath }),
    files: new FileAccess({ homeDir: root, systemDrive: 'Z:', userFolders: { documents: join(root, 'Documents') } }),
    apps: new StartAppCatalog(),
    shell: {
      openExternal: async (url) => {
        opened.push(url)
      },
      openPath: async (path) => {
        opened.push(path)
        return ''
      },
      trashItem: async (path) => {
        trashed.push(path)
      },
    },
    ownPids: () => new Set([process.pid]),
    homeDir: root,
    platform: options.platform ?? 'win32',
  })
  return {
    service,
    approvals,
    opened,
    trashed,
    auditEntries: async () => (await readFile(auditPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as AuditEntry),
  }
}

describe('desktopControlService', () => {
  it('opens a web address without a question and logs it', async () => {
    const harness = createHarness()
    await expect(harness.service.webOpen({ url: 'youtube.com' })).resolves.toEqual({ url: 'https://youtube.com/' })
    expect(harness.approvals).toEqual([])
    expect(harness.opened).toEqual(['https://youtube.com/'])
    expect(await harness.auditEntries()).toMatchObject([{ action: 'web-open', decision: 'allowed', ok: true }])
  })

  it('blocks a forbidden command before it asks the user', async () => {
    const harness = createHarness({ approve: true })
    await expect(harness.service.terminalRun({ shell: 'powershell', command: 'Format-Volume -DriveLetter D' })).rejects.toThrow('does not run this command')
    expect(harness.approvals).toEqual([])
    expect(await harness.auditEntries()).toMatchObject([{ action: 'terminal-run', decision: 'blocked', ok: false }])
  })

  it('does not delete when the user denies', async () => {
    const harness = createHarness({ approve: false })
    await expect(harness.service.fileDelete({ path: join(root, 'Documents', 'notes.txt') })).rejects.toThrow('denied')
    expect(harness.approvals).toHaveLength(1)
    expect(harness.approvals[0]!.detail).toContain('notes.txt')
    expect(harness.trashed).toEqual([])
    expect(await harness.auditEntries()).toMatchObject([{ action: 'file-delete', decision: 'denied', ok: false }])
  })

  it('moves a file to the Recycle Bin after approval, but never a main folder', async () => {
    const harness = createHarness({ approve: true })
    await harness.service.fileDelete({ path: join(root, 'Documents', 'notes.txt') })
    expect(harness.trashed).toEqual([join(root, 'Documents', 'notes.txt')])
    await expect(harness.service.fileDelete({ path: 'documents' })).rejects.toThrow('main user folders')
    expect(harness.approvals).toHaveLength(1)
  })

  it('asks before it opens a script, but not before it opens a document', async () => {
    const harness = createHarness({ approve: true })
    await harness.service.fileOpen({ path: join(root, 'Documents', 'notes.txt') })
    expect(harness.approvals).toHaveLength(0)
    await harness.service.fileOpen({ path: join(root, 'Documents', 'setup.bat') })
    expect(harness.approvals).toHaveLength(1)
    expect(harness.opened).toHaveLength(2)
  })

  it('refuses every action outside Windows', async () => {
    const harness = createHarness({ platform: 'linux' })
    await expect(harness.service.webOpen({ url: 'https://example.com' })).rejects.toThrow('only on Windows')
    expect(harness.opened).toEqual([])
  })

  it.runIf(process.platform === 'win32')('runs an approved PowerShell command in the home folder', async () => {
    const harness = createHarness({ approve: true })
    const result = await harness.service.terminalRun({ shell: 'powershell', command: '(Get-Location).Path; "ชิโระ"', reason: 'test' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([root, 'ชิโระ'])
    expect(harness.approvals[0]!.detail).toContain('Reason: test')

    const cmd = await harness.service.terminalRun({ shell: 'cmd', command: 'echo "a & b" & echo สวัสดี & exit /b 3' })
    expect(cmd.exitCode).toBe(3)
    expect(cmd.stdout.split(/\r?\n/).map(line => line.trim())).toEqual(['"a & b"', 'สวัสดี', ''])
  }, 30_000)
})
