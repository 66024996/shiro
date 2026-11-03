import type { FileReadResult, FileSearchResult } from '../../../../shared/eventa/desktop-control'
import type { PathAccessScope } from './policy'

import { Buffer } from 'node:buffer'
import { open, opendir, realpath, stat } from 'node:fs/promises'
import { win32 } from 'node:path'

import { normalizeAppName } from './app-catalog'
import { findDeleteDenial, findPathAccessDenial } from './policy'

/** Folders that search skips. They are large and rarely hold what the user means. */
const SKIPPED_FOLDER_NAMES = new Set(['node_modules', '.git', '.venv', '__pycache__', '.cache', 'windows', 'program files', 'program files (x86)', 'programdata'])

const MAX_SEARCH_RESULTS = 50
const MAX_SEARCH_ENTRIES = 40_000
const SEARCH_TIME_BUDGET_MS = 8_000
const MAX_READ_BYTES = 2 * 1024 * 1024
const MAX_READ_FILE_BYTES = 20 * 1024 * 1024
const DEFAULT_READ_CHARS = 8_000
const MAX_READ_CHARS = 20_000

export interface FileAccessOptions extends PathAccessScope {
  /**
   * Folder aliases, for example `{ documents: 'C:\\Users\\name\\Documents' }`.
   * Search uses them by default. The `home` alias always means `homeDir`.
   */
  userFolders: Record<string, string>
  now?: () => number
}

/** File access inside the folders that the Shiro policy allows. */
export class FileAccess {
  constructor(private readonly options: FileAccessOptions) {}

  get protectedFolders() {
    return Object.values(this.options.userFolders)
  }

  /**
   * Resolves a path or folder alias to a real path, and checks it against the policy.
   * Throws when the path does not exist or the policy denies it.
   */
  async resolve(input: string): Promise<string> {
    const trimmed = input.trim()
    const alias = trimmed.toLowerCase()
    const candidate = alias === 'home' ? this.options.homeDir : this.options.userFolders[alias] ?? trimmed
    if (!win32.isAbsolute(candidate) || /^[a-z]:(?![\\/])/i.test(candidate))
      throw new Error(`Use a full path such as D:\\folder\\file.txt, or one of these folders: home, ${Object.keys(this.options.userFolders).join(', ')}.`)
    this.assertAllowed(candidate)

    let real: string
    try {
      real = await realpath(candidate)
    }
    catch {
      throw new Error(`Nothing exists at ${candidate}.`)
    }
    // A link can point outside the allowed folders, so the real path is checked again.
    this.assertAllowed(real)
    return real
  }

  /** Throws when a resolved path is a drive root or a main user folder. */
  assertDeletable(path: string) {
    const denial = findDeleteDenial(path, this.options, this.protectedFolders)
    if (denial)
      throw new Error(denial)
  }

  private assertAllowed(path: string) {
    const denial = findPathAccessDenial(path, this.options)
    if (denial)
      throw new Error(denial)
  }

  /** Finds files and folders whose names contain every word of the query. */
  async search(query: string, options: { folder?: string, limit?: number } = {}): Promise<FileSearchResult> {
    const words = normalizeAppName(query).split(' ').filter(Boolean)
    if (words.length === 0)
      throw new Error('Give a file name or a part of it.')
    const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, options.limit ?? 20))
    const roots = options.folder
      ? [await this.resolve(options.folder)]
      : (await Promise.all(this.protectedFolders.map(folder => this.resolve(folder).catch(() => undefined))))
          .filter((folder): folder is string => !!folder)

    const now = this.options.now ?? Date.now
    const deadline = now() + SEARCH_TIME_BUDGET_MS
    const queue = [...new Set(roots)]
    const matches: FileSearchResult['matches'] = []
    let visited = 0
    let incomplete = false

    while (queue.length > 0) {
      if (visited >= MAX_SEARCH_ENTRIES || now() > deadline) {
        incomplete = true
        break
      }
      const folder = queue.shift()!
      let directory
      try {
        directory = await opendir(folder)
      }
      catch {
        continue
      }
      for await (const entry of directory) {
        visited++
        // Links can loop or leave the allowed folders, so search never follows them.
        if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
          continue
        const path = win32.join(folder, entry.name)
        if (findPathAccessDenial(path, this.options))
          continue
        if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('$') && !SKIPPED_FOLDER_NAMES.has(entry.name.toLowerCase()))
          queue.push(path)

        const name = normalizeAppName(entry.name)
        if (matches.length < limit && words.every(word => name.includes(word))) {
          const info = await stat(path).catch(() => undefined)
          matches.push({
            path,
            kind: entry.isDirectory() ? 'folder' : 'file',
            sizeBytes: entry.isFile() ? info?.size ?? null : null,
            modified: info?.mtime.toISOString() ?? '',
          })
        }
      }
      if (matches.length >= limit) {
        incomplete = queue.length > 0
        break
      }
    }
    return { matches, incomplete }
  }

  /** Reads the start of a text file. Binary files are refused. */
  async readText(input: string, maxChars = DEFAULT_READ_CHARS): Promise<FileReadResult> {
    const path = await this.resolve(input)
    const info = await stat(path)
    if (!info.isFile())
      throw new Error('This path is a folder. Use file_search to see what it holds.')
    if (info.size > MAX_READ_FILE_BYTES)
      throw new Error(`The file is larger than ${MAX_READ_FILE_BYTES / 1024 / 1024} MiB, so Shiro does not read it.`)

    const handle = await open(path, 'r')
    let bytes: Buffer
    try {
      const buffer = Buffer.alloc(Math.min(info.size, MAX_READ_BYTES))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      bytes = buffer.subarray(0, bytesRead)
    }
    finally {
      await handle.close()
    }

    const text = decodeText(bytes)
    const limit = Math.min(MAX_READ_CHARS, Math.max(1, maxChars))
    return {
      path,
      sizeBytes: info.size,
      text: text.slice(0, limit),
      truncated: text.length > limit || info.size > bytes.length,
    }
  }
}

/** Decodes UTF-8 or UTF-16 text. Throws for binary data. */
export function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE)
    return bytes.subarray(2).toString('utf16le')
  if (bytes[0] === 0xFE && bytes[1] === 0xFF)
    return Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1))).swap16().toString('utf16le')
  if (bytes.subarray(0, 8192).includes(0))
    throw new Error('This file is not text, so Shiro cannot read it. Use file_open to open it in its app.')
  const text = bytes.toString('utf8')
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}
