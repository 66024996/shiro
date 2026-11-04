import { describe, expect, it } from 'vitest'

import { Emotion, resolveEmotionMotion } from './emotions'

const hiyoriMotions = [
  ['Idle', 0],
  ['Idle', 1],
  ['Idle', 2],
  ['Flick', 0],
  ['FlickDown', 0],
  ['FlickUp', 0],
  ['Tap', 0],
  ['Tap', 1],
  ['Tap@Body', 0],
  ['Flick@Body', 0],
].map(([motionName, motionIndex]) => ({ motionName: String(motionName), motionIndex: Number(motionIndex) }))

describe('resolveEmotionMotion', () => {
  it('uses the group named after the emotion when the model has it', () => {
    expect(resolveEmotionMotion(Emotion.Happy, [{ motionName: 'Happy', motionIndex: 0 }, ...hiyoriMotions])).toEqual({ group: 'Happy' })
  })

  // ROOT CAUSE:
  //
  // The stage asked Hiyori for motion groups such as "Happy" and "Sad", which it does not have,
  // so no emotion ever played a motion.
  it.each([
    [Emotion.Happy, { group: 'Tap', index: 1 }],
    [Emotion.Surprise, { group: 'Tap', index: 0 }],
    [Emotion.Sad, { group: 'Flick@Body' }],
    [Emotion.Awkward, { group: 'Tap@Body' }],
    [Emotion.Think, { group: 'FlickDown' }],
  ])('maps %s to the Hiyori motion %o first', (emotion, motion) => {
    expect(resolveEmotionMotion(emotion, hiyoriMotions, { random: () => 0 })).toEqual(motion)
  })

  // ROOT CAUSE:
  //
  // Each emotion always played the same motion, so the avatar looked repetitive.
  it('does not repeat the previous motion when another one fits', () => {
    const first = resolveEmotionMotion(Emotion.Happy, hiyoriMotions, { random: () => 0 })
    for (const value of [0, 0.5, 0.99]) {
      const next = resolveEmotionMotion(Emotion.Happy, hiyoriMotions, { previous: first, random: () => value })
      expect(next).not.toEqual(first)
      expect(next).toBeDefined()
    }
  })

  it('repeats a motion when it is the only one that fits', () => {
    const only = { group: 'Tap', index: 0 }
    expect(resolveEmotionMotion(Emotion.Surprise, hiyoriMotions, { previous: only })).toEqual(only)
  })

  it('skips a fallback whose motion index the model does not have', () => {
    expect(resolveEmotionMotion(Emotion.Happy, [{ motionName: 'Tap', motionIndex: 0 }, { motionName: 'FlickUp', motionIndex: 0 }])).toEqual({ group: 'FlickUp' })
  })

  it('keeps the current motion when no motion fits', () => {
    expect(resolveEmotionMotion(Emotion.Think, [{ motionName: 'Idle', motionIndex: 0 }])).toBeUndefined()
    expect(resolveEmotionMotion(Emotion.Happy, [{ motionName: 'Idle', motionIndex: 0 }])).toBeUndefined()
  })
})
