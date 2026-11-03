import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { RequestUserApproval } from '../user-approval'

import process from 'node:process'

import { join, sep } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createComputerUseRuntime } from './runtime'

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(context: ReturnType<typeof createContext>['context'], approve: RequestUserApproval) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  let stopped = false
  function getRuntime() {
    if (stopped)
      throw new Error('Computer use has stopped.')
    if (!runtime) {
      const executable = binaryPath()
      runtime = createComputerUseRuntime({
        // Native executables cannot run inside Electron's archive.
        binaryPath: app.isPackaged ? executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`) : executable,
        storeRoot: join(app.getPath('userData'), 'computer-use'),
        windowsScriptPath: app.isPackaged
          ? join(process.resourcesPath, 'computer-use', 'windows.ps1')
          : join(app.getAppPath(), 'resources', 'computer-use', 'windows.ps1'),
        approveWindowsAction: summary => approve({
          title: 'Shiro computer use | ชิโระขอควบคุมคอมพิวเตอร์',
          message: summary,
          detail: 'Shiro requests this action on your Windows desktop. This approval applies only to this action.\nชิโระขอทำรายการนี้บนหน้าจอ การอนุมัตินี้ใช้กับรายการนี้ครั้งเดียว',
        }),
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, input => getRuntime().run(input))
  defineInvokeHandler(context, computerUseReadImage, input => getRuntime().readImage(input))
  onAppBeforeQuit(async () => {
    stopped = true
    await runtime?.dispose()
  })
}
