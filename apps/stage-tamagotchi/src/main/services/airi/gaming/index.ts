import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { createGamingConfig } from '../../../configs/gaming'
import type { GameDetector } from './detector'
import type { GamingResources } from './resources'

import { defineInvokeHandler } from '@moeru/eventa'
import { parse } from 'valibot'

import { gamingConfigGet, gamingConfigSet, gamingDetectedGameGet, gamingResourcesSet, gamingRunningAppsList } from '../../../../shared/eventa/gaming'
import { gamingConfigSchema } from '../../../configs/gaming'
import { listRunningProcesses } from '../desktop-control/processes'

export { GameDetector, listChildProcessIds, listProcessesWithTasklist } from './detector'
export { GamingResources } from './resources'

/** Serves the Gaming Mode contracts to every renderer through the global IPC context. */
export function setupGamingService(
  context: ReturnType<typeof createContext>['context'],
  options: { config: ReturnType<typeof createGamingConfig>, detector: GameDetector, resources: GamingResources },
) {
  defineInvokeHandler(context, gamingConfigGet, () => parse(gamingConfigSchema, options.config.get()))
  defineInvokeHandler(context, gamingConfigSet, async (request) => {
    const next = parse(gamingConfigSchema, request)
    options.config.update(next)
    await options.detector.check()
    return next
  })
  defineInvokeHandler(context, gamingDetectedGameGet, () => options.detector.currentGame)
  defineInvokeHandler(context, gamingRunningAppsList, async () => {
    const processes = await listRunningProcesses()
    const apps = processes
      .filter(item => item.windowTitle && item.windowHandle === undefined)
      .map(item => ({ processName: `${item.name}.exe`, windowTitle: item.windowTitle }))
    return [...new Map(apps.map(app => [app.processName.toLowerCase(), app])).values()]
      .sort((left, right) => left.processName.localeCompare(right.processName))
  })
  defineInvokeHandler(context, gamingResourcesSet, async ({ gaming }) => {
    await options.resources.setGaming(gaming)
  })
}
