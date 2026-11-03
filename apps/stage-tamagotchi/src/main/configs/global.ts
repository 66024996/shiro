import { array, boolean, object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const shortcutAcceleratorSchema = object({
  modifiers: array(picklist(['cmd-or-ctrl', 'cmd', 'ctrl', 'alt', 'shift', 'super'])),
  key: string(),
})

const assistantProfileSchema = object({
  name: optional(string(), 'Shiro'),
  displayName: optional(string(), 'ชิโระ'),
  wakeWord: optional(string(), 'ชิโระ'),
  personality: optional(string(), 'ยันเดเระขี้เล่น'),
  defaultMode: optional(picklist(['normal', 'gaming', 'permission-review']), 'normal'),
  gamingMode: optional(boolean(), true),
  visionDisabledByDefault: optional(boolean(), true),
  localFirst: optional(boolean(), true),
})

export const globalAppConfigSchema = object({
  hideAppIcon: optional(boolean()),
  language: optional(string()),
  spotlightShortcutAccelerator: optional(shortcutAcceleratorSchema),
  updateChannel: optional(picklist(['latest', 'stable', 'alpha', 'beta', 'nightly', 'canary'])),
  assistantProfile: optional(assistantProfileSchema),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema, {
    default: {
      assistantProfile: {
        name: 'Shiro',
        displayName: 'ชิโระ',
        wakeWord: 'ชิโระ',
        personality: 'ยันเดเระขี้เล่น',
        defaultMode: 'normal',
        gamingMode: true,
        visionDisabledByDefault: true,
        localFirst: true,
      },
    },
  })
  config.setup()

  return config
}
