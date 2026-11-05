let context: AudioContext | undefined

/**
 * Plays a short rising two-note chime, so the user hears that Shiro is listening for a command.
 * It needs no audio file. A failure is ignored, because the chime is only a hint.
 */
export function playListeningChime() {
  try {
    context ??= new AudioContext()
    const start = context.currentTime
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const noteStart = start + index * 0.09
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.18)
    }
  }
  catch (error) {
    console.warn('[chime] Failed to play the listening chime:', error)
  }
}
