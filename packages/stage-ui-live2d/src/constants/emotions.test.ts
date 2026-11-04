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
  ])('maps %s to the Hiyori motion %o', (emotion, motion) => {
    expect(resolveEmotionMotion(emotion, hiyoriMotions)).toEqual(motion)
  })

  it('uses the next fallback when a motion index is missing', () => {
    expect(resolveEmotionMotion(Emotion.Happy, [{ motionName: 'Tap', motionIndex: 0 }])).toEqual({ group: 'Tap' })
  })

  it('keeps the current motion when no motion fits', () => {
    expect(resolveEmotionMotion(Emotion.Think, hiyoriMotions)).toBeUndefined()
    expect(resolveEmotionMotion(Emotion.Happy, [{ motionName: 'Idle', motionIndex: 0 }])).toBeUndefined()
  })
})
