import { FALLBACK_TUTOR_MODELS } from './tutor-model-catalog'

export interface TutorModel { id: string; name: string }

/** Only the four models selected by the product owner may be listed or requested. */
export async function getTutorModels(): Promise<{
  models: TutorModel[]
  source: 'curated'
  enabled: boolean
  defaultModel: string
}> {
  const configured = process.env.ZENMUX_MODEL?.trim()
  const defaultModel = FALLBACK_TUTOR_MODELS.some(model => model.id === configured)
    ? configured!
    : 'openai/gpt-5.6-luna'
  return {
    models: FALLBACK_TUTOR_MODELS.map(model => ({ ...model })),
    source: 'curated',
    enabled: Boolean(process.env.ZENMUX_API_KEY?.trim()),
    defaultModel,
  }
}
