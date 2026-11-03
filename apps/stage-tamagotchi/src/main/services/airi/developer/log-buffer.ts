// Terminal color codes, for example "\u001B[31m".

const ANSI_PATTERN = /\u001B\[[\d;]*m/g

/** Keeps the newest log lines in memory for Developer Mode. */
export class LogBuffer {
  private readonly lines: string[] = []

  constructor(private readonly maxLines = 300) {}

  push(formatted: string) {
    for (const line of formatted.replace(ANSI_PATTERN, '').split(/\r?\n/)) {
      if (!line.trim())
        continue
      this.lines.push(line.length > 1000 ? `${line.slice(0, 1000)}…` : line)
    }
    if (this.lines.length > this.maxLines)
      this.lines.splice(0, this.lines.length - this.maxLines)
  }

  /** Returns the lines, oldest first. */
  snapshot() {
    return [...this.lines]
  }
}
