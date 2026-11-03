import type { TachieEmotion } from '../constants/emotions'

import { unzipSync, zipSync } from 'fflate'

import { DEFAULT_TACHIE_EMOTION, isTachieEmotion, TACHIE_EMOTIONS } from '../constants/emotions'
import { resolveTachieArchiveLayout, TACHIE_ARCHIVE_SUFFIX } from './tachie-archive'

/** One source image for each emotion. `neutral` is required by the archive format. */
export type TachieImageSet = Partial<Record<TachieEmotion, Blob>>

/**
 * Longest canvas side in pixels. A larger `neutral` image is scaled down, so a phone photo
 * does not create a huge texture for an avatar that is shown small on screen.
 */
const MAX_CANVAS_SIDE = 2048

/** Alpha below this value counts as transparent when the builder checks for a background. */
const TRANSPARENT_ALPHA = 250

export interface TachieBuildResult {
  file: File
  /** Emotions whose image has no transparent pixels, so it likely has a solid background. */
  opaqueEmotions: TachieEmotion[]
}

function canvasSizeFor(width: number, height: number) {
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function hasTransparentPixel(context: OffscreenCanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height)
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < TRANSPARENT_ALPHA)
      return true
  }
  return false
}

/**
 * Draws one image onto a transparent canvas of the shared archive size.
 *
 * The image keeps its aspect ratio, fits inside the canvas, and is centered horizontally
 * and aligned to the bottom, so characters of different heights stand on the same line.
 */
async function renderToCanvasSize(image: Blob, width: number, height: number) {
  const bitmap = await createImageBitmap(image)
  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context)
      throw new Error('2D canvas is not available.')

    // The source is checked before the transparent padding is added around it.
    const source = new OffscreenCanvas(bitmap.width, bitmap.height)
    const sourceContext = source.getContext('2d', { willReadFrequently: true })
    if (!sourceContext)
      throw new Error('2D canvas is not available.')
    sourceContext.drawImage(bitmap, 0, 0)
    const transparent = hasTransparentPixel(sourceContext, bitmap.width, bitmap.height)

    const scale = Math.min(width / bitmap.width, height / bitmap.height)
    const drawWidth = Math.round(bitmap.width * scale)
    const drawHeight = Math.round(bitmap.height * scale)
    context.drawImage(bitmap, Math.round((width - drawWidth) / 2), height - drawHeight, drawWidth, drawHeight)

    const png = await canvas.convertToBlob({ type: 'image/png' })
    return { png, transparent }
  }
  finally {
    bitmap.close()
  }
}

/**
 * Builds a `.tachie.zip` from one image per emotion.
 *
 * The `neutral` image sets the shared canvas size. Every other image is fitted onto that
 * canvas, so the archive always passes the same-dimension rule of the loader.
 *
 * @example
 * await createTachieZip({ neutral: idlePng, happy: smilePng }, 'Shiro gaming')
 * // => { file: File('Shiro gaming.tachie.zip'), opaqueEmotions: [] }
 */
export async function createTachieZip(images: TachieImageSet, name: string): Promise<TachieBuildResult> {
  const neutral = images[DEFAULT_TACHIE_EMOTION]
  if (!neutral)
    throw new Error('A Tachie archive needs a neutral image.')

  const neutralBitmap = await createImageBitmap(neutral)
  const { width, height } = canvasSizeFor(neutralBitmap.width, neutralBitmap.height)
  neutralBitmap.close()

  const entries: Record<string, Uint8Array> = {}
  const opaqueEmotions: TachieEmotion[] = []
  for (const emotion of TACHIE_EMOTIONS) {
    const image = images[emotion]
    if (!image)
      continue

    const { png, transparent } = await renderToCanvasSize(image, width, height)
    entries[`${emotion}.png`] = new Uint8Array(await png.arrayBuffer())
    if (!transparent)
      opaqueEmotions.push(emotion)
  }

  // PNG data is already compressed, so the archive stores it without deflate.
  const archive = zipSync(entries, { level: 0 })
  const file = new File([archive], `${name}${TACHIE_ARCHIVE_SUFFIX}`, { type: 'application/zip' })
  return { file, opaqueEmotions }
}

/**
 * Reads the emotion images of an existing archive, so an editor can show and replace them.
 * Files that are not emotion images are skipped.
 */
export async function readTachieZipImages(file: Blob): Promise<TachieImageSet> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const layout = resolveTachieArchiveLayout(Object.keys(files))
  if (layout.errors.length > 0)
    throw new Error(layout.errors.join(' '))

  const images: TachieImageSet = {}
  for (const entry of layout.entries) {
    const bytes = files[entry.path]
    if (bytes && isTachieEmotion(entry.emotion))
      images[entry.emotion] = new Blob([bytes])
  }
  return images
}
