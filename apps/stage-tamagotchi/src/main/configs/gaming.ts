import type { GamingConfig } from '../../shared/eventa/gaming'

import { array, boolean, maxLength, minLength, object, pipe, string, trim } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const gameEntrySchema = object({
  name: pipe(string(), trim(), minLength(1), maxLength(80)),
  processName: pipe(string(), trim(), minLength(1), maxLength(120)),
})

export const gamingConfigSchema = object({
  autoDetect: boolean(),
  games: pipe(array(gameEntrySchema), maxLength(200)),
})

/** Common Windows games, by the process that runs during play. Launchers are left out. */
export const DEFAULT_GAMES: GamingConfig['games'] = [
  { name: 'League of Legends', processName: 'League of Legends.exe' },
  { name: 'VALORANT', processName: 'VALORANT-Win64-Shipping.exe' },
  { name: 'Counter-Strike 2', processName: 'cs2.exe' },
  { name: 'Dota 2', processName: 'dota2.exe' },
  { name: 'Genshin Impact', processName: 'GenshinImpact.exe' },
  { name: 'Honkai: Star Rail', processName: 'StarRail.exe' },
  { name: 'Zenless Zone Zero', processName: 'ZenlessZoneZero.exe' },
  { name: 'Overwatch 2', processName: 'Overwatch.exe' },
  { name: 'Fortnite', processName: 'FortniteClient-Win64-Shipping.exe' },
  { name: 'Apex Legends', processName: 'r5apex.exe' },
  { name: 'PUBG: Battlegrounds', processName: 'TslGame.exe' },
  { name: 'Roblox', processName: 'RobloxPlayerBeta.exe' },
  { name: 'Minecraft', processName: 'Minecraft.Windows.exe' },
  { name: 'Rocket League', processName: 'RocketLeague.exe' },
  { name: 'Grand Theft Auto V', processName: 'GTA5.exe' },
  { name: 'Elden Ring', processName: 'eldenring.exe' },
  { name: 'osu!', processName: 'osu!.exe' },
  { name: 'Marvel Rivals', processName: 'Marvel-Win64-Shipping.exe' },
]

export function createGamingConfig() {
  const config = createConfig('gaming', 'options.json', gamingConfigSchema, {
    default: { autoDetect: true, games: DEFAULT_GAMES },
    autoHeal: true,
  })
  config.setup()
  return config
}
