import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { AuditLog } from '../desktop-control/audit-log'
import type { LogBuffer } from './log-buffer'
import type { ProcessToSample } from './metrics'

import { defineInvokeHandler } from '@moeru/eventa'

import { developerActionsGet, developerLogsGet, developerMetricsGet } from '../../../../shared/eventa/developer'
import { sampleMetrics } from './metrics'

export { LogBuffer } from './log-buffer'

/**
 * Serves Developer Mode data to every renderer through the global IPC context.
 * Nothing runs in the background: the settings page asks for a sample while it is open.
 */
export function setupDeveloperService(
  context: ReturnType<typeof createContext>['context'],
  options: { logs: LogBuffer, auditLog: AuditLog, listProcesses: () => Promise<ProcessToSample[]> },
) {
  defineInvokeHandler(context, developerMetricsGet, async () => sampleMetrics(await options.listProcesses()))
  defineInvokeHandler(context, developerLogsGet, () => options.logs.snapshot())
  defineInvokeHandler(context, developerActionsGet, () => options.auditLog.readRecent(30))
}
