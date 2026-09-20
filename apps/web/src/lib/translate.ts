'use client'

// Multi-language translation on top of the keyless cloud LLM channel.
//
// Like the tutor chat, the model call must originate in the browser (the cloud service
// forbids server-side proxying), so everything here runs client-side.

import { getCloudClient, pickCloudModel } from '@/lib/cloud-llm'

export interface TranslateLanguage {
  code: string
  /** Chinese display name. Sent to the model verbatim as the language name. */
  label: string
}

/** The eight core languages, listed first in every picker. */
export const CORE_TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { code: 'zh-Hans', label: '中文（简体）' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
]

/** Additional languages the same model handles, offered right after the core eight. */
export const EXTRA_TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { code: 'zh-Hant', label: '中文（繁体）' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'it', label: '意大利语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'th', label: '泰语' },
  { code: 'vi', label: '越南语' },
  { code: 'id', label: '印尼语' },
  { code: 'tr', label: '土耳其语' },
  { code: 'nl', label: '荷兰语' },
]

export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  ...CORE_TRANSLATE_LANGUAGES,
  ...EXTRA_TRANSLATE_LANGUAGES,
]

/** Sentinel for the source picker: let the model work out the source language. */
export const AUTO_DETECT = 'auto'

export function languageLabel(code: string): string {
  return TRANSLATE_LANGUAGES.find((item) => item.code === code)?.label ?? code
}

export interface CloudTranslationResult {
  translation: string
  /** Chinese name of the detected source language, when a source was not pinned down. */
  detectedSource: string | null
  /** A short translator's note, when the model flagged something worth knowing. */
  notes: string | null
}

type ChatChunk = { choices?: Array<{ delta?: { content?: string | null } | null }> }

function buildSystemPrompt(sourceLanguage: string, targetLanguage: string): string {
  return [
    `你是一名专业翻译，负责把用户给出的内容翻译成${targetLanguage}。`,
    sourceLanguage === AUTO_DETECT
      ? '源语言未指定，请你自行判断。'
      : `源语言是${sourceLanguage}。`,
    '要求：',
    '1. 只输出译文，忠实原意，保持原文的语气、专业术语、换行与列表等格式。',
    '2. 不要解释、不要加引号、不要复述原文。',
    '3. 严格返回如下 JSON 对象，不要输出 Markdown 代码围栏或任何额外说明：',
    '{"translation": string, "detectedSource": string, "notes": string}',
    'detectedSource 填检测到的源语言中文名称（源语言已明确指定时填空字符串）；notes 填必要的简短译注（没有则填空字符串）。',
  ].join('\n')
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Parses the model output into a translation.
 *
 * The model is asked for JSON, but a translation is too valuable to lose to a formatting
 * slip - so this degrades gracefully: first the raw payload, then the first {...} block,
 * and finally the raw text itself as the译文.
 */
function parseTranslationPayload(raw: string): CloudTranslationResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [cleaned]
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<CloudTranslationResult>
      const translation = asOptionalString(parsed?.translation)
      if (translation) {
        return {
          translation,
          detectedSource: asOptionalString(parsed.detectedSource),
          notes: asOptionalString(parsed.notes),
        }
      }
    } catch {
      // Not JSON - try the next candidate.
    }
  }

  if (cleaned) return { translation: cleaned, detectedSource: null, notes: null }
  throw new Error('INVALID_TRANSLATION_RESPONSE')
}

/**
 * Translates one block of text over the cloud channel. The channel is streaming-only, so
 * the reply is accumulated before parsing.
 */
export async function requestCloudTranslation(params: {
  text: string
  sourceLanguage: string
  targetLanguage: string
  signal?: AbortSignal
}): Promise<CloudTranslationResult> {
  const model = await pickCloudModel()

  let raw = ''
  const stream = (await getCloudClient().llm.chat.completions.create({
    model,
    messages: [
      { role: 'system' as const, content: buildSystemPrompt(params.sourceLanguage, params.targetLanguage) },
      { role: 'user' as const, content: params.text },
    ],
    stream: true,
    temperature: 0.2,
    signal: params.signal,
  })) as AsyncIterable<ChatChunk>

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) raw += delta
  }

  return parseTranslationPayload(raw)
}
