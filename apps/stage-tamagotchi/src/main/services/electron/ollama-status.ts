import type { OllamaServiceStatus } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { array, object, safeParse, string } from 'valibot'

const ollamaTagsSchema = object({
  models: array(object({
    name: string(),
  })),
})

/**
 * Reads the installed model list from the local Ollama service.
 */
export async function getOllamaStatus(): Promise<OllamaServiceStatus> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok)
      throw new Error(`Ollama returned HTTP ${response.status}.`)

    const result = safeParse(ollamaTagsSchema, await response.json())
    if (!result.success)
      throw new Error('Ollama returned an invalid model list.')

    return {
      state: 'available',
      models: result.output.models.map(model => model.name),
    }
  }
  catch (error) {
    return {
      state: 'unavailable',
      models: [],
      message: errorMessageFrom(error) ?? 'Ollama is not available at 127.0.0.1:11434.',
    }
  }
}
