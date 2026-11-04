import { describe, expect, it } from 'vitest'

import { Emotion } from '../../constants/emotions'
import { emotionFaceOffsetsOf, stepEmotionFaceOffsets } from './emotion-face'

describe('stepEmotionFaceOffsets', () => {
  // ROOT CAUSE:
  //
  // Hiyori has no expression files and no motion groups named after emotions,
  // so the stage asked for a "Happy" motion that did not exist and the face never changed.
  it('moves the face toward the emotion and settles there', () => {
    const target = emotionFaceOffsetsOf(Emotion.Happy)
    let offsets = stepEmotionFaceOffsets({}, target, 1 / 30)

    expect(offsets.ParamMouthForm).toBeGreaterThan(0)
    expect(offsets.ParamMouthForm).toBeLessThan(1)

    for (let frame = 0; frame < 120; frame++)
      offsets = stepEmotionFaceOffsets(offsets, target, 1 / 30)
    expect(offsets.ParamMouthForm).toBeCloseTo(1, 3)
  })

  it('returns to a neutral face and drops settled offsets', () => {
    let offsets: Record<string, number> = { ParamMouthForm: 1, ParamCheek: 0.6 }
    for (let frame = 0; frame < 120; frame++)
      offsets = stepEmotionFaceOffsets(offsets, emotionFaceOffsetsOf(Emotion.Neutral), 1 / 30)

    expect(offsets).toEqual({})
  })

  it('does not change the face when no time passed', () => {
    expect(stepEmotionFaceOffsets({ ParamCheek: 0.2 }, emotionFaceOffsetsOf(Emotion.Sad), 0).ParamCheek).toBe(0.2)
  })
})

describe('emotionFaceOffsetsOf', () => {
  it('gives a neutral face for an unknown emotion', () => {
    expect(emotionFaceOffsetsOf('sleepy')).toEqual({})
  })

  it('never sets eye opening or mouth opening, which blinking and lip sync own', () => {
    for (const emotion of Object.values(Emotion)) {
      const offsets = emotionFaceOffsetsOf(emotion)
      expect(Object.keys(offsets)).not.toContain('ParamMouthOpenY')
      expect(Object.keys(offsets)).not.toContain('ParamEyeLOpen')
      expect(Object.keys(offsets)).not.toContain('ParamEyeROpen')
    }
  })
})
