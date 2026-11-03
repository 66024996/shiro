import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { DesktopControlService } from './service'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  desktopControlAppClose,
  desktopControlAppOpen,
  desktopControlFileDelete,
  desktopControlFileOpen,
  desktopControlFileRead,
  desktopControlFileSearch,
  desktopControlProcessList,
  desktopControlSystemStatus,
  desktopControlTerminalRun,
  desktopControlWebOpen,
} from '../../../../shared/eventa/desktop-control'

export { StartAppCatalog } from './app-catalog'
export { AuditLog } from './audit-log'
export { FileAccess } from './files'
export { DesktopControlService } from './service'

/** Serves the desktop control contracts to every renderer through the global IPC context. */
export function setupDesktopControlService(context: ReturnType<typeof createContext>['context'], service: DesktopControlService) {
  defineInvokeHandler(context, desktopControlSystemStatus, request => service.systemStatus(request))
  defineInvokeHandler(context, desktopControlProcessList, request => service.processList(request))
  defineInvokeHandler(context, desktopControlAppOpen, request => service.appOpen(request))
  defineInvokeHandler(context, desktopControlAppClose, request => service.appClose(request))
  defineInvokeHandler(context, desktopControlWebOpen, request => service.webOpen(request))
  defineInvokeHandler(context, desktopControlFileSearch, request => service.fileSearch(request))
  defineInvokeHandler(context, desktopControlFileRead, request => service.fileRead(request))
  defineInvokeHandler(context, desktopControlFileOpen, request => service.fileOpen(request))
  defineInvokeHandler(context, desktopControlFileDelete, request => service.fileDelete(request))
  defineInvokeHandler(context, desktopControlTerminalRun, request => service.terminalRun(request))
}
