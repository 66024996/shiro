import { defineInvokeEventa } from '@moeru/eventa'

/** One game that Gaming Mode detects by its process name, for example `VALORANT-Win64-Shipping.exe`. */
export interface GameEntry {
  name: string
  processName: string
}

export interface GamingConfig {
  /** Turns Gaming Mode on while a listed game runs. */
  autoDetect: boolean
  games: GameEntry[]
}

/** A running app with a window, offered in settings to add as a game. */
export interface RunningAppEntry {
  processName: string
  windowTitle: string
}

export const gamingConfigGet = defineInvokeEventa<GamingConfig>('eventa:invoke:shiro:gaming:config:get')
export const gamingConfigSet = defineInvokeEventa<GamingConfig, GamingConfig>('eventa:invoke:shiro:gaming:config:set')
/** The listed game that runs now, or null. */
export const gamingDetectedGameGet = defineInvokeEventa<GameEntry | null>('eventa:invoke:shiro:gaming:detected-game:get')
export const gamingRunningAppsList = defineInvokeEventa<RunningAppEntry[]>('eventa:invoke:shiro:gaming:running-apps:list')
/** Frees resources for a game, or gives them back. The main stage window calls it when Gaming Mode changes. */
export const gamingResourcesSet = defineInvokeEventa<void, { gaming: boolean }>('eventa:invoke:shiro:gaming:resources:set')
