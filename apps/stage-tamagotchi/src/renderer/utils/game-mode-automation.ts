import type { GameEntry } from '../../shared/eventa/gaming'

/**
 * Decides when game detection turns Gaming Mode on and off, without fighting the user.
 *
 * - A listed game starts while Gaming Mode is off: turn it on.
 * - That game ends: turn Gaming Mode off, but only when detection turned it on.
 * - The user turns Gaming Mode off during a game: keep it off until that game ends.
 * - The user turns Gaming Mode on: keep it on after a game ends.
 */
export class GameModeAutomation {
  private game: GameEntry | null = null
  private enabledByDetection = false
  private suppressedProcess: string | undefined
  /** The value that this class set last. The next Gaming Mode change with this value is not a user change. */
  private expectedChange: boolean | undefined

  constructor(
    private readonly isGaming: () => boolean,
    private readonly setGaming: (gaming: boolean) => void,
  ) {}

  get runningGame() {
    return this.game
  }

  onGameChange(game: GameEntry | null) {
    this.game = game
    if (game) {
      if (this.isGaming() || this.suppressedProcess === game.processName)
        return
      this.enabledByDetection = true
      this.apply(true)
      return
    }

    this.suppressedProcess = undefined
    if (this.enabledByDetection && this.isGaming())
      this.apply(false)
    this.enabledByDetection = false
  }

  /** Call on every Gaming Mode change, also on changes that this class made. */
  onGamingModeChange(gaming: boolean) {
    if (this.expectedChange === gaming) {
      this.expectedChange = undefined
      return
    }

    this.enabledByDetection = false
    if (!gaming && this.game)
      this.suppressedProcess = this.game.processName
  }

  private apply(gaming: boolean) {
    this.expectedChange = gaming
    this.setGaming(gaming)
  }
}
