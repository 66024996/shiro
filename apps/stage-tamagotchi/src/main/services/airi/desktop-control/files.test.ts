import process from 'node:process'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { decodeText, FileAccess } from './files'

describe('decodeText', () => {
  it('decodes UTF-8 with and without a byte order mark', () => {
    expect(decodeText(Buffer.from('สวัสดี'))).toBe('สวัสดี')
    expect(decodeText(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('hi')]))).toBe('hi')
  })

  it('decodes UTF-16 little endian and big endian', () => {
    expect(decodeText(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('ชิโระ', 'utf16le')]))).toBe('ชิโระ')
    expect(decodeText(Buffer.concat([Buffer.from([0xFE, 0xFF]), Buffer.from('ab', 'utf16le').swap16()]))).toBe('ab')
  })

  it('refuses binary data', () => {
    expect(() => decodeText(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x01]))).toThrow('not text')
  })
})

// The policy denies AppData, which holds the system temp folder, so the fixture lives in node_modules.
describe.runIf(process.platform === 'win32')('fileAccess on Windows', () => {
  let root: string
  let access: FileAccess

  beforeAll(async () => {
    const parent = join(process.cwd(), 'node_modules', '.vitest-tmp')
    await mkdir(parent, { recursive: true })
    root = await mkdtemp(join(parent, 'files-'))
    await mkdir(join(root, 'Documents', 'Shiro Notes'), { recursive: true })
    await mkdir(join(root, 'Documents', 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(root, 'Documents', 'Shiro Notes', 'game plan.md'), '# แผนเล่นเกม\nwin')
    await writeFile(join(root, 'Documents', 'node_modules', 'pkg', 'game plan.md'), 'hidden')
    await writeFile(join(root, 'Documents', '.env'), 'TOKEN=secret')
    await writeFile(join(root, 'Documents', 'long.txt'), 'x'.repeat(30))
    access = new FileAccess({
      homeDir: root,
      systemDrive: 'Z:',
      userFolders: { documents: join(root, 'Documents') },
    })
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('finds files by every query word and skips dependency folders', async () => {
    const result = await access.search('plan game')
    expect(result.matches.map(match => match.path)).toEqual([join(root, 'Documents', 'Shiro Notes', 'game plan.md')])
    expect(result.incomplete).toBe(false)
  })

  it('reads a text file through a folder alias and cuts long text', async () => {
    const plan = await access.readText(join(root, 'Documents', 'Shiro Notes', 'game plan.md'))
    expect(plan.text).toBe('# แผนเล่นเกม\nwin')
    const long = await access.readText(join(root, 'Documents', 'long.txt'), 10)
    expect(long).toMatchObject({ text: 'x'.repeat(10), truncated: true })
    await expect(access.resolve('documents')).resolves.toBe(join(root, 'Documents'))
  })

  it('refuses secrets, relative paths, and missing files', async () => {
    await expect(access.readText(join(root, 'Documents', '.env'))).rejects.toThrow('keys or passwords')
    await expect(access.readText('notes.txt')).rejects.toThrow('full path')
    await expect(access.readText(join(root, 'missing.txt'))).rejects.toThrow('Nothing exists')
  })

  it('checks where a link really points', async () => {
    const link = join(root, 'Documents', 'windows-link')
    try {
      await symlink('C:\\Windows', link, 'junction')
    }
    catch {
      return
    }
    const strict = new FileAccess({ homeDir: root, systemDrive: 'C:', userFolders: {} })
    await expect(strict.resolve(join(link, 'win.ini'))).rejects.toThrow()
  })
})
