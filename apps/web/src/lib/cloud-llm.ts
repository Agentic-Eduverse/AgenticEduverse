'use client'

import { extractPartialAnswer } from './stream-json-answer'
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

// Values copied verbatim from the WorkBuddy Cloud Service `publicConfig`
// (applicationId wbapp_ruwsuqNOQFPjgIP0a4yX9o, app 「智慧课堂」).
// The publishableKey is an app identifier, not a secret - the server enforces an exact
// Origin match, so it is safe to ship in client code. Keep it out of logs.
const CLOUD_CONFIG = {
  endpoint: 'https://eduverse-classroom.app.workbuddy.host',
  publishableKey: 'wbpk_ruwsuqNOQFPjgIP0a4yX9o_QXRnkDeXYEF2N0BUv4Qg7IZW56AsOXY3',
} as const

type CloudClient = ReturnType<typeof createWorkBuddyCloud>
type ChatChunk = { choices?: Array<{ delta?: { content?: string | null } | null }> }

let client: CloudClient | null = null

export function getCloudClient(): CloudClient {
  if (!client) {
    client = createWorkBuddyCloud({
      endpoint: CLOUD_CONFIG.endpoint,
      publishableKey: CLOUD_CONFIG.publishableKey,
    })
  }
  return client
}

let cachedModelId: string | null = null

/**
 * Resolves the model to use, per the SDK guidance: ask the directory, never hard-code an id.
 * `disabled === true` means the directory currently marks the model as non-selectable.
 */
export async function pickCloudModel(): Promise<string> {
  if (cachedModelId) return cachedModelId
  const models = await getCloudClient().llm.models.list()
  const usable = models.filter((model) => model.disabled !== true)
  if (usable.length === 0) throw new Error('NO_MODEL_AVAILABLE')
  cachedModelId = usable[0].id
  return cachedModelId
}

export interface CloudPracticeExercise {
  question: string
  options?: string[]
  answer: string
  explanation: string
}

export interface CloudTutorResponse {
  answer: string
  guidingQuestions: string[]
  practiceExercises: CloudPracticeExercise[]
  encouragement: string
  /** Short knowledge-point terms used to look up explanation videos. */
  videoKeywords: string[]
}

const TUTOR_SYSTEM_PROMPT = [
  '你是学生的一对一辅导老师。通过启发式问题帮助理解，避免只给最终答案。',
  'videoKeywords 用来在视频站检索讲解视频：给 1-3 个简短的中文知识点词（如「分数的意义」「一元二次方程求根」），',
  '不要写整句话、不要带标点、不要带「什么是」这类问句词；优先给出{年级+学科}最核心的那个知识点。',
  '严格返回如下 JSON 对象，不要输出 Markdown 代码围栏或任何额外说明：',
  '{"answer": string, "guidingQuestions": string[], "practiceExercises": [{"question": string, "options": string[], "answer": string, "explanation": string}], "encouragement": string, "videoKeywords": string[]}',
].join('\n')

/**
 * One-shot structured tutor reply over the cloud channel.
 * The channel is streaming-only, so the full JSON text is accumulated from the SSE chunks
 * and parsed on this side.
 */
export async function requestCloudTutor(params: {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  subject?: string
  signal?: AbortSignal
  onAnswer?: (text: string) => void
}): Promise<CloudTutorResponse> {
  const model = await pickCloudModel()
  const subjectLine = params.subject ? `当前学科为${params.subject}。` : ''

  const messages = [
    { role: 'system' as const, content: `${TUTOR_SYSTEM_PROMPT}\n${subjectLine}` },
    ...params.history.slice(-30).filter((item) => item.role === 'user' || item.role === 'assistant'),
    { role: 'user' as const, content: params.message },
  ]

  let text = ''
  const stream = (await getCloudClient().llm.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.3,
    signal: params.signal,
  })) as AsyncIterable<ChatChunk>

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      text += delta
      const answer = extractPartialAnswer(text)
      if (answer) params.onAnswer?.(answer.value)
    }
  }

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: Partial<CloudTutorResponse>
  try {
    parsed = JSON.parse(cleaned) as Partial<CloudTutorResponse>
  } catch {
    throw new Error('INVALID_TUTOR_RESPONSE')
  }
  if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    throw new Error('INVALID_TUTOR_RESPONSE')
  }

  return {
    answer: parsed.answer,
    guidingQuestions: Array.isArray(parsed.guidingQuestions) ? parsed.guidingQuestions : [],
    practiceExercises: Array.isArray(parsed.practiceExercises) ? parsed.practiceExercises : [],
    encouragement: typeof parsed.encouragement === 'string' ? parsed.encouragement : '',
    // Older turns of a conversation may predate this field; the caller falls back to the
    // student's own question as the search term.
    videoKeywords: Array.isArray(parsed.videoKeywords)
      ? parsed.videoKeywords.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
      : [],
  }
}
