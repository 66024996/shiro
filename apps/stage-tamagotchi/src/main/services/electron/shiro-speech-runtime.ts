import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'

import type { App, Dialog } from 'electron'

import type { ShiroSpeechServiceStatus } from '../../../shared/eventa'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, extname, join, parse, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { array, boolean, object, safeParse, string } from 'valibot'

const speechHealthSchema = object({
  ok: boolean(),
  voices: array(string()),
  voice_configured: boolean(),
})

const voiceExtensions = new Set(['.flac', '.mp3', '.wav'])

class ShiroSpeechRuntime {
  private readonly speechRoot: string
  private readonly voiceDirectory: string
  private child: ChildProcess | undefined
  private lastError: string | undefined
  private lastErrorKind: 'runtime-missing' | 'service-failed' | undefined
  private stopping = false
  private readonly log = useLogg('shiro-speech').useGlobalConfig()

  constructor(
    private readonly application: Pick<App, 'getAppPath' | 'getPath' | 'isPackaged'>,
    private readonly fileDialog: Pick<Dialog, 'showOpenDialog'>,
  ) {
    this.speechRoot = application.isPackaged
      ? join(dirname(application.getAppPath()), 'shiro-speech')
      : resolve(application.getAppPath(), '../../../f5_server')
    this.voiceDirectory = join(application.getPath('userData'), 'speech', 'voices')
  }

  async start() {
    if (this.child)
      return

    if (this.application.isPackaged) {
      try {
        await this.seedBundledVoiceReference()
      }
      catch (error) {
        this.lastError = errorMessageFrom(error) ?? 'The bundled Shiro voice reference could not be installed.'
        this.lastErrorKind = 'service-failed'
        this.log.withError(error).error('Failed to install the bundled Shiro voice reference')
        return
      }
    }

    if (process.platform !== 'win32') {
      this.lastError = 'The offline speech runtime is available in the Windows build.'
      return
    }

    const pythonPath = this.application.isPackaged
      ? join(this.speechRoot, 'python', 'python.exe')
      : join(this.speechRoot, '.venv_omnivoice', 'Scripts', 'python.exe')
    const serverPath = this.application.isPackaged
      ? join(this.speechRoot, 'server', 'omnivoice_server.py')
      : join(this.speechRoot, 'omnivoice_server.py')
    if (!existsSync(pythonPath) || !existsSync(serverPath)) {
      this.lastError = 'The offline speech runtime files are missing.'
      this.lastErrorKind = 'runtime-missing'
      this.log.error(this.lastError)
      return
    }

    const corePackages = this.application.isPackaged
      ? join(this.speechRoot, 'site-packages', 'core')
      : join(this.speechRoot, '.venv', 'Lib', 'site-packages')
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      HF_HOME: join(this.speechRoot, 'hf_cache'),
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      SHIRO_SPEECH_VOICE_DIR: this.voiceDirectory,
      ...(this.application.isPackaged
        ? {
            PYTHONHOME: join(this.speechRoot, 'python'),
            HF_HUB_OFFLINE: '1',
            TRANSFORMERS_OFFLINE: '1',
          }
        : {
            PYTHONPATH: [corePackages, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
          }),
    }
    if (this.application.isPackaged)
      delete environment.PYTHONPATH

    this.stopping = false
    this.lastError = undefined
    this.lastErrorKind = undefined
    this.child = spawn(pythonPath, [
      serverPath,
      '--port',
      '5052',
      '--device',
      'auto',
      '--model-id',
      'hotdogs/omnivoice-thai',
      '--stt-model',
      'small',
      '--voices-dir',
      this.voiceDirectory,
    ], {
      cwd: this.speechRoot,
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })

    this.child.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim()
      if (message)
        this.log.error(`[speech-service] ${message}`)
    })
    this.child.on('error', (error) => {
      this.lastError = errorMessageFrom(error) ?? 'The offline speech service failed to start.'
      this.lastErrorKind = 'service-failed'
      this.log.withError(error).error('Failed to start the offline speech service')
    })
    this.child.on('exit', (code, signal) => {
      if (this.stopping)
        return

      this.lastError = `The offline speech service stopped (${code === null ? signal ?? 'unknown' : `exit code ${code}`}).`
      this.lastErrorKind = 'service-failed'
      this.log.error(this.lastError)
    })
  }

  async stop() {
    const child = this.child
    if (!child || child.exitCode !== null)
      return

    this.stopping = true
    const closed = new Promise<void>((resolveClose) => {
      child.once('close', () => resolveClose())
    })
    child.kill()
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      closed,
      new Promise<void>((resolveTimeout) => {
        timeout = setTimeout(() => {
          child.kill()
          resolveTimeout()
        }, 5000)
      }),
    ])
    if (timeout)
      clearTimeout(timeout)
    this.child = undefined
  }

  private async seedBundledVoiceReference() {
    const bundledVoiceDirectory = join(this.speechRoot, 'voices')
    const bundledAudioPath = join(bundledVoiceDirectory, 'shiro.wav')
    const bundledTranscriptPath = join(bundledVoiceDirectory, 'shiro.txt')
    if (!existsSync(bundledAudioPath) || !existsSync(bundledTranscriptPath))
      return

    const voiceNames = existsSync(this.voiceDirectory) ? await readdir(this.voiceDirectory) : []
    if (voiceNames.some(name => parse(name).name === 'shiro' && (voiceExtensions.has(extname(name).toLowerCase()) || name === 'shiro.txt')))
      return

    await mkdir(this.voiceDirectory, { recursive: true })
    const stagingDirectory = await mkdtemp(join(this.voiceDirectory, '.bundled-'))
    const stagedAudioPath = join(stagingDirectory, 'shiro.wav')
    const stagedTranscriptPath = join(stagingDirectory, 'shiro.txt')
    const userAudioPath = join(this.voiceDirectory, 'shiro.wav')
    const userTranscriptPath = join(this.voiceDirectory, 'shiro.txt')

    try {
      await copyFile(bundledAudioPath, stagedAudioPath)
      await copyFile(bundledTranscriptPath, stagedTranscriptPath)
      await rename(stagedAudioPath, userAudioPath)
      await rename(stagedTranscriptPath, userTranscriptPath)
    }
    catch (error) {
      await rm(userAudioPath, { force: true })
      await rm(userTranscriptPath, { force: true })
      throw error
    }
    finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }
  }

  /** The process ID of the running speech server, for example to lower its priority during a game. */
  processId(): number | undefined {
    return this.child && this.child.exitCode === null ? this.child.pid : undefined
  }

  async getStatus(): Promise<ShiroSpeechServiceStatus> {
    if (process.platform !== 'win32')
      return { state: 'unsupported', voiceConfigured: false, message: { kind: 'runtime-unsupported' } }

    if (this.lastError)
      return { state: 'error', voiceConfigured: false, message: { kind: this.lastErrorKind ?? 'service-failed' } }

    if (!this.child || this.child.exitCode !== null)
      return { state: 'error', voiceConfigured: false, message: { kind: 'service-not-running' } }

    let response: Response
    try {
      response = await fetch('http://127.0.0.1:5052/health', {
        signal: AbortSignal.timeout(1500),
      })
    }
    catch {
      return { state: 'starting', voiceConfigured: false, message: { kind: 'service-starting' } }
    }

    if (!response.ok)
      return { state: 'error', voiceConfigured: false, message: { kind: 'service-http-error', status: response.status } }

    let body: unknown
    try {
      body = await response.json()
    }
    catch {
      return { state: 'error', voiceConfigured: false, message: { kind: 'service-invalid-response' } }
    }

    const result = safeParse(speechHealthSchema, body)
    if (!result.success || !result.output.ok)
      return { state: 'error', voiceConfigured: false, message: { kind: 'service-invalid-response' } }

    return {
      state: 'ready',
      voiceConfigured: result.output.voice_configured,
    }
  }

  async importVoice(transcript: string): Promise<{ imported: boolean }> {
    const normalizedTranscript = transcript.trim()
    if (!normalizedTranscript)
      throw new Error('Enter the words spoken in the voice clip.')
    if (normalizedTranscript.length > 2000)
      throw new Error('The transcript must contain 2,000 characters or fewer.')

    const selection = await this.fileDialog.showOpenDialog({
      title: 'Select a voice reference',
      properties: ['openFile'],
      filters: [{ name: 'Audio files', extensions: ['wav', 'mp3', 'flac'] }],
    })
    if (selection.canceled)
      return { imported: false }

    const sourcePath = selection.filePaths[0]
    if (!sourcePath)
      throw new Error('No audio file was selected.')

    const extension = extname(sourcePath).toLowerCase()
    if (!voiceExtensions.has(extension))
      throw new Error('Select a WAV, MP3, or FLAC audio file.')

    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size === 0 || sourceStat.size > 25 * 1024 * 1024)
      throw new Error('Select an audio file that is smaller than 25 MB.')

    await mkdir(this.voiceDirectory, { recursive: true })
    const stagingDirectory = await mkdtemp(join(this.voiceDirectory, '.import-'))
    const audioName = `shiro${extension}`
    const stagedAudioPath = join(stagingDirectory, audioName)
    const stagedTranscriptPath = join(stagingDirectory, 'shiro.txt')
    const finalAudioPath = join(this.voiceDirectory, audioName)
    const finalTranscriptPath = join(this.voiceDirectory, 'shiro.txt')
    const previousFiles = new Map<string, string>()

    try {
      await copyFile(sourcePath, stagedAudioPath)
      await writeFile(stagedTranscriptPath, `${normalizedTranscript}\n`, 'utf8')

      const existingNames = await readdir(this.voiceDirectory)
      for (const name of existingNames) {
        if (parse(name).name !== 'shiro' || (!voiceExtensions.has(extname(name).toLowerCase()) && name !== 'shiro.txt'))
          continue

        const backupPath = join(stagingDirectory, `backup-${name}`)
        await rename(join(this.voiceDirectory, name), backupPath)
        previousFiles.set(name, backupPath)
      }

      await rename(stagedAudioPath, finalAudioPath)
      await rename(stagedTranscriptPath, finalTranscriptPath)
    }
    catch (error) {
      for (const name of ['shiro.wav', 'shiro.mp3', 'shiro.flac', 'shiro.txt'])
        await rm(join(this.voiceDirectory, name), { force: true })

      for (const [name, backupPath] of previousFiles)
        await rename(backupPath, join(this.voiceDirectory, name))

      throw error
    }
    finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }

    return { imported: true }
  }
}

/**
 * Creates the app-owned speech runtime and its local voice setup operations.
 */
export function createShiroSpeechRuntime(
  application: Pick<App, 'getAppPath' | 'getPath' | 'isPackaged'>,
  fileDialog: Pick<Dialog, 'showOpenDialog'>,
) {
  return new ShiroSpeechRuntime(application, fileDialog)
}
