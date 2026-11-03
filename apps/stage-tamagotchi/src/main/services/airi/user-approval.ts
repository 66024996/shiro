import type { MessageBoxOptions } from 'electron'

import { Mutex } from 'async-mutex'
import { BrowserWindow, dialog } from 'electron'

export interface UserApprovalRequest {
  /** Window title of the dialog. */
  title: string
  /** The action, in one or two short lines. */
  message: string
  /** Extra details, for example the full command text. */
  detail: string
}

export type RequestUserApproval = (request: UserApprovalRequest) => Promise<boolean>

/**
 * Creates a native approval dialog for actions that need the user's consent.
 *
 * Only one dialog is open at a time. A later request waits until the user answers the
 * earlier one. "Deny" is the default button, so pressing Enter or Escape denies.
 * `onPendingChange` reports when a dialog opens and closes, so the avatar can show it.
 */
export function createNativeUserApproval(onPendingChange?: (pending: boolean) => void): RequestUserApproval {
  const mutex = new Mutex()
  return request => mutex.runExclusive(async () => {
    const parent = BrowserWindow.getFocusedWindow()
      ?? BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.isVisible())
    const options: MessageBoxOptions = {
      type: 'question',
      title: request.title,
      message: request.message,
      detail: request.detail,
      buttons: ['Allow once | อนุญาตครั้งนี้', 'Deny | ปฏิเสธ'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }
    onPendingChange?.(true)
    try {
      const result = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)
      return result.response === 0
    }
    finally {
      onPendingChange?.(false)
    }
  })
}
