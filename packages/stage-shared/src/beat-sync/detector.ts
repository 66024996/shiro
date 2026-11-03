import type { Analyser, AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'
import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'

import type { BeatSyncDetectorEventMap, BeatSyncDetectorState } from './types'

import analyserWorklet from '@nekopaw/tempora/worklet?url'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { startAnalyser as startTemporaAnalyser } from '@nekopaw/tempora'
import { setupElectronScreenCapture } from '@proj-airi/electron-screen-capture/renderer'

import { isStageCapacitor, isStageTamagotchi, isStageWeb, StageEnvironment } from '../environment'
import { isElectronWindow } from '../window'
import {
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetInputByteFrequencyDataInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateParametersInvokeEventa,
  createContext,
} from './eventa'

export const inputAnalyserFFTSize = 1024

export interface BeatSyncDetector {
  start: (createSource: (context: AudioContext) => Promise<AudioNode>) => Promise<void>
  updateParameters: (params: Partial<AnalyserWorkletParameters>) => void
  startScreenCapture: () => Promise<void>
  stop: () => void
  on: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => () => void
  off: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => void
  getInputByteFrequencyData: () => Uint8Array<ArrayBuffer>
  readonly state: BeatSyncDetectorState
  readonly context: AudioContext | undefined
  readonly analyser: Analyser | undefined
  readonly source: AudioNode | undefined
}

export type CreateBeatSyncDetectorOptions
  = | { env: StageEnvironment.Tamagotchi }
    | { env: StageEnvironment.Web }
    | { env: StageEnvironment.Capacitor }

export function createBeatSyncDetector(options: CreateBeatSyncDetectorOptions): BeatSyncDetector {
  let context: AudioContext | undefined
  let analyser: Analyser | undefined
  let source: AudioNode | undefined
  const state = {
    isActive: false,
  }

  let stopSource: (() => void) | undefined

  let inputAnalyserNode: AnalyserNode | undefined
  let inputAnalyserBuffer: Uint8Array<ArrayBuffer> | undefined

  const listeners: { [K in keyof BeatSyncDetectorEventMap]: Array<(...args: any) => void> } = {
    stateChange: [],
    beat: [],
  }

  const emit = <E extends keyof BeatSyncDetectorEventMap>(event: E, ...args: Parameters<BeatSyncDetectorEventMap[E]>) => {
    listeners[event].forEach(listener => listener(...args))
  }

  const stop = () => {
    if (!state.isActive)
      return

    state.isActive = false
    emit('stateChange', state)
    stopSource?.()
    stopSource = undefined

    if (inputAnalyserNode) {
      inputAnalyserNode.disconnect()
      inputAnalyserNode = undefined
      inputAnalyserBuffer = undefined
    }

    source?.disconnect()
    source = undefined

    analyser?.stop()
    analyser = undefined

    context?.close()
    context = undefined
  }

  const start = async (createSource: (context: AudioContext) => Promise<AudioNode>) => {
    stop()

    context = new AudioContext()
    analyser = await startTemporaAnalyser({
      context,
      worklet: analyserWorklet,
      listeners: {
        onBeat: e => emit('beat', e),
      },
    })

    const node = await createSource(context)

    inputAnalyserNode = context.createAnalyser()
    inputAnalyserNode.fftSize = inputAnalyserFFTSize // Fast Fourier Transform size (power of 2, 32-32768)
    // A smaller fftSize gives better time resolution but worse frequency resolution.
    inputAnalyserNode.smoothingTimeConstant = 0.8 // A value between 0 and 1. Higher value smooths out changes.
    inputAnalyserBuffer = new Uint8Array(inputAnalyserNode.frequencyBinCount)

    node.connect(inputAnalyserNode)
    inputAnalyserNode.connect(analyser?.workletNode)

    source = node

    state.isActive = true
    emit('stateChange', state)
  }

  const updateParameters = (params: Partial<AnalyserWorkletParameters>) => {
    analyser?.updateParameters(params)
  }

  const startScreenCapture = async () => start(async (ctx) => {
    switch (options.env) {
      case StageEnvironment.Web: {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: true,
        })

        if (stream.getAudioTracks().length === 0) {
          throw new Error('No audio track available in the stream')
        }

        stream.getAudioTracks().forEach((track) => {
          let stopCalled = false
          track.addEventListener('ended', () => {
            if (stopCalled)
              return
            stopCalled = true
            stop()
          })
        })

        const node = ctx.createMediaStreamSource(stream)
        stopSource = () => {
          stream.getTracks().forEach(track => track.stop())
        }

        return node
      }
      case StageEnvironment.Tamagotchi: {
        if (!isElectronWindow(window)) {
          throw new Error(`Electron window is required for this environment: ${options.env}`)
        }

        // FIXME(Makito): Will refactor later
        const { createContext } = await import('@moeru/eventa/adapters/electron/renderer')
        const { selectWithSource } = setupElectronScreenCapture(createContext(window.electron.ipcRenderer).context)

        const stream = await selectWithSource(
          (sources: SerializableDesktopCapturerSource[]) => {
            if (sources.length === 0)
              throw new Error('No screen source available')
            return sources[0].id
          },
          async () => await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          }),
          { sourcesOptions: { types: ['screen'] } },
        )

        const videoTracks = stream.getVideoTracks()

        videoTracks.forEach((track: MediaStreamTrack) => {
          track.stop()
          stream.removeTrack(track)
        })

        const node = ctx.createMediaStreamSource(stream)
        stopSource = () => {
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
        }

        return node
      }
      default:
        throw new Error('Failed to start screen capture: Unsupported environment')
    }
  })

  const off = <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
    const listenerFns = listeners[event]
    if (!listenerFns) {
      throw new Error(`Unknown event: ${event}`)
    }

    const index = listenerFns.indexOf(listener)
    if (index !== -1)
      listenerFns.splice(index, 1)
  }

  const on = <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
    const listenerFns = listeners[event]
    if (!listenerFns) {
      throw new Error(`Unknown event: ${event}`)
    }
    listenerFns.push(listener)
    return () => off(event, listener)
  }

  const getInputByteFrequencyData = () => {
    inputAnalyserNode?.getByteFrequencyData(inputAnalyserBuffer!)
    return inputAnalyserBuffer!
  }

  return {
    start,
    updateParameters,
    startScreenCapture,
    stop,
    on,
    off,
    getInputByteFrequencyData,

    get state() { return state },
    get context() { return context },
    get analyser() { return analyser },
    get source() { return source },
  }
}

let detector: BeatSyncDetector | undefined
function getDetector() {
  if (!isStageWeb())
    throw new Error('getDetector() is only available in Stage Web environment')

  if (!detector)
    detector = createBeatSyncDetector({ env: StageEnvironment.Web })

  return detector
}

let context: ReturnType<typeof createContext> | undefined

/**
 * Starts the renderer that runs Beat Sync, for a desktop app that creates it on demand.
 *
 * Without a host, the helpers expect a running detector renderer, as before.
 */
export interface BeatSyncHost {
  /** Creates the detector renderer if it does not run, and waits until it answers. */
  ensure: () => Promise<void>
  /** Returns whether the detector renderer runs. */
  started: () => Promise<boolean>
}

let host: BeatSyncHost | undefined

/** Registers the host of the Beat Sync renderer. Call it once in each renderer of the desktop app. */
export function setBeatSyncHost(nextHost: BeatSyncHost | undefined) {
  host = nextHost
}

/** True when a host exists and its detector renderer does not run, so a call has nothing to reach. */
async function hostNotStarted() {
  return host !== undefined && !(await host.started())
}

function installCapacitorHandlers(context: ReturnType<typeof createContext>) {
  defineInvokeHandler(context, beatSyncToggleInvokeEventa, async (enabled) => {
    if (enabled)
      throw new Error('Beat Sync is not available in Stage Pocket')
  })
  defineInvokeHandler(context, beatSyncGetStateInvokeEventa, async () => ({ isActive: false }))
  defineInvokeHandler(context, beatSyncUpdateParametersInvokeEventa, async () => {})
  defineInvokeHandler(context, beatSyncGetInputByteFrequencyDataInvokeEventa, async () => {
    return new Uint8Array(inputAnalyserFFTSize / 2)
  })
}

function getContext() {
  if (!context) {
    context = createContext()

    // Capacitor cannot capture system audio. Register every request handler so
    // callers receive deterministic inactive results instead of pending forever.
    if (isStageCapacitor())
      installCapacitorHandlers(context)
  }

  return context
}

/** Returns whether the current Stage runtime can capture audio for Beat Sync. */
export function isBeatSyncSupported() {
  return isStageWeb() || isStageTamagotchi()
}

export function toggleBeatSync(enabled: boolean) {
  if (isStageWeb()) {
    if (enabled) {
      return getDetector().startScreenCapture()
    }
    else {
      return getDetector().stop()
    }
  }

  if (isStageTamagotchi() || isStageCapacitor())
    return toggleThroughContext(enabled)

  throw new Error('Unknown environment for beatSyncToggle()')
}

async function toggleThroughContext(enabled: boolean) {
  if (host) {
    if (enabled)
      await host.ensure()
    else if (!(await host.started()))
      return
  }

  return defineInvoke(getContext(), beatSyncToggleInvokeEventa)(enabled)
}

export async function getBeatSyncState() {
  if (isStageWeb()) {
    return getDetector().state
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    if (await hostNotStarted())
      return { isActive: false }
    return defineInvoke(getContext(), beatSyncGetStateInvokeEventa)()
  }

  throw new Error('Unknown environment for getBeatSyncState()')
}

export function updateBeatSyncParameters(params: Partial<AnalyserWorkletParameters>) {
  if (isStageWeb()) {
    return getDetector().updateParameters(params)
  }

  if (isStageTamagotchi() || isStageCapacitor())
    return updateParametersThroughContext(params)

  throw new Error('Unknown environment for updateBeatSyncParameters()')
}

async function updateParametersThroughContext(params: Partial<AnalyserWorkletParameters>) {
  // A detector that does not run gets the parameters when it starts, from the settings page.
  if (await hostNotStarted())
    return
  return defineInvoke(getContext(), beatSyncUpdateParametersInvokeEventa)(params)
}

export function listenBeatSyncStateChange(listener: (state: BeatSyncDetectorState) => void) {
  if (isStageWeb()) {
    return getDetector().on('stateChange', listener)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return defineInvokeHandler(getContext(), beatSyncStateChangedInvokeEventa, listener)
  }

  throw new Error('Unknown environment for listenBeatSyncStateChange()')
}

export function listenBeatSyncBeatSignal(listener: (e: AnalyserBeatEvent) => void) {
  if (isStageWeb()) {
    return getDetector().on('beat', listener)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return defineInvokeHandler(getContext(), beatSyncBeatSignaledInvokeEventa, listener)
  }

  throw new Error('Unknown environment for listenBeatSyncBeatSignal()')
}

export async function getBeatSyncInputByteFrequencyData() {
  if (isStageWeb()) {
    return getDetector().getInputByteFrequencyData()
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    if (await hostNotStarted())
      return new Uint8Array(inputAnalyserFFTSize / 2)
    return defineInvoke(getContext(), beatSyncGetInputByteFrequencyDataInvokeEventa)()
  }

  throw new Error('Unknown environment for getBeatSyncInputByteFrequencyData()')
}
