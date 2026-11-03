import type { AssistantActivity } from '../../../shared/eventa/assistant-activity'

type AssistantActivityListener = (activity: AssistantActivity) => void

/**
 * Sends assistant activity from main services to the windows that show the avatar.
 *
 * The approval dialog and the desktop-control service report here. The main window forwards each event to its renderer.
 */
export class AssistantActivityEvents {
  private readonly listeners = new Set<AssistantActivityListener>()

  emit(activity: AssistantActivity) {
    for (const listener of this.listeners) {
      try {
        listener(activity)
      }
      catch (error) {
        console.warn('[assistant-activity] A listener failed:', error)
      }
    }
  }

  /** Returns a function that removes the listener. */
  subscribe(listener: AssistantActivityListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
