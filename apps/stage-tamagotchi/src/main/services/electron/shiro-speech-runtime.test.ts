import type { App, Dialog } from 'electron'
import type { MockedFunction } from 'vitest'

import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createShiroSpeechRuntime } from './shiro-speech-runtime'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn<typeof import('node:child_process').spawn>(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, spawn: spawnMock }
})

describe('shiro speech voice import', () => {
  let directory: string
  let sourceAudio: string
  let showOpenDialog: MockedFunction<Dialog['showOpenDialog']>

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shiro-speech-runtime-'))
    sourceAudio = join(directory, 'reference.wav')
    await writeFile(sourceAudio, Buffer.from('sample audio'))
    showOpenDialog = vi.fn<Dialog['showOpenDialog']>(async () => ({ canceled: false, filePaths: [sourceAudio] }))
    spawnMock.mockReset()
    spawnMock.mockReturnValue(new ChildProcess())
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  function createRuntime(dialogOverride = showOpenDialog, isPackaged = false) {
    const application: Pick<App, 'getAppPath' | 'getPath' | 'isPackaged'> = {
      getAppPath: () => isPackaged ? join(directory, 'resources', 'app.asar') : join(directory, 'app'),
      getPath: () => join(directory, 'user-data'),
      isPackaged,
    }
    const fileDialog: Pick<Dialog, 'showOpenDialog'> = {
      showOpenDialog: dialogOverride,
    }
    return createShiroSpeechRuntime(application, fileDialog)
  }

  async function createPackagedRuntime() {
    const speechRoot = join(directory, 'resources', 'shiro-speech')
    const bundledVoiceDirectory = join(speechRoot, 'voices')
    await mkdir(join(speechRoot, 'python'), { recursive: true })
    await mkdir(join(speechRoot, 'server'), { recursive: true })
    await mkdir(bundledVoiceDirectory, { recursive: true })
    await writeFile(join(speechRoot, 'python', 'python.exe'), '')
    await writeFile(join(speechRoot, 'server', 'omnivoice_server.py'), '')
    await writeFile(join(bundledVoiceDirectory, 'shiro.wav'), 'bundled audio')
    await writeFile(join(bundledVoiceDirectory, 'shiro.txt'), 'bundled transcript\n')
    return createRuntime(showOpenDialog, true)
  }

  it('seeds the packaged voice reference on first launch', async () => {
    const runtime = await createPackagedRuntime()

    await runtime.start()

    const userVoiceDirectory = join(directory, 'user-data', 'speech', 'voices')
    await expect(readFile(join(userVoiceDirectory, 'shiro.wav'), 'utf8')).resolves.toBe('bundled audio')
    await expect(readFile(join(userVoiceDirectory, 'shiro.txt'), 'utf8')).resolves.toBe('bundled transcript\n')
    expect(spawnMock).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 0)
  })

  it('keeps an existing imported Shiro voice instead of replacing it', async () => {
    const runtime = await createPackagedRuntime()
    const userVoiceDirectory = join(directory, 'user-data', 'speech', 'voices')
    await mkdir(userVoiceDirectory, { recursive: true })
    await writeFile(join(userVoiceDirectory, 'shiro.mp3'), 'imported audio')
    await writeFile(join(userVoiceDirectory, 'shiro.txt'), 'imported transcript\n')

    await runtime.start()

    const files = await readdir(userVoiceDirectory)
    expect(files.sort()).toEqual(['shiro.mp3', 'shiro.txt'])
    await expect(readFile(join(userVoiceDirectory, 'shiro.mp3'), 'utf8')).resolves.toBe('imported audio')
    await expect(readFile(join(userVoiceDirectory, 'shiro.txt'), 'utf8')).resolves.toBe('imported transcript\n')
    expect(spawnMock).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 0)
  })

  it('stores the selected audio and transcript in app user data', async () => {
    const runtime = createRuntime()

    await expect(runtime.importVoice('สวัสดีค่ะ')).resolves.toEqual({ imported: true })

    const voiceDirectory = join(directory, 'user-data', 'speech', 'voices')
    await expect(readFile(join(voiceDirectory, 'shiro.wav'))).resolves.toEqual(await readFile(sourceAudio))
    await expect(readFile(join(voiceDirectory, 'shiro.txt'), 'utf8')).resolves.toBe('สวัสดีค่ะ\n')
  })

  it('replaces prior Shiro reference files when the audio format changes', async () => {
    const runtime = createRuntime()
    const voiceDirectory = join(directory, 'user-data', 'speech', 'voices')
    await mkdir(voiceDirectory, { recursive: true })
    await writeFile(join(voiceDirectory, 'shiro.wav'), 'old audio')
    await writeFile(join(voiceDirectory, 'shiro.txt'), 'old transcript')
    const mp3Path = join(directory, 'reference.mp3')
    await writeFile(mp3Path, Buffer.from('sample mp3'))
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [mp3Path] })

    await runtime.importVoice('new transcript')

    const files = await readdir(voiceDirectory)
    expect(files.sort()).toEqual(['shiro.mp3', 'shiro.txt'])
    await expect(readFile(join(voiceDirectory, 'shiro.txt'), 'utf8')).resolves.toBe('new transcript\n')
  })

  it('does not write a file when the user cancels the file picker', async () => {
    const runtime = createRuntime(vi.fn(async () => ({ canceled: true, filePaths: [] })))

    await expect(runtime.importVoice('voice transcript')).resolves.toEqual({ imported: false })
    await expect(readdir(join(directory, 'user-data', 'speech', 'voices'))).rejects.toThrow()
  })

  it('rejects empty transcripts before opening the file picker', async () => {
    const runtime = createRuntime()

    await expect(runtime.importVoice('   ')).rejects.toThrow('Enter the words spoken in the voice clip.')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('rejects unsupported audio formats', async () => {
    const runtime = createRuntime()
    const unsupportedPath = join(directory, 'reference.ogg')
    await writeFile(unsupportedPath, Buffer.from('sample audio'))
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [unsupportedPath] })

    await expect(runtime.importVoice('voice transcript')).rejects.toThrow('Select a WAV, MP3, or FLAC audio file.')
  })
})
