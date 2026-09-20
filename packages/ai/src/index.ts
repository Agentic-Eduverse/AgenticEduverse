import { consumeSSE } from './sse'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma, Prisma } from '@eduverse/db'

export interface StudentForAssignment { studentId: string; name: string }

export class AIConfigurationError extends Error {
  constructor() {
    super('AI_NOT_CONFIGURED')
    this.name = 'AIConfigurationError'
  }
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL && process.env.AI_API_KEY)
}

export function isTutorAIConfigured(): boolean {
  return Boolean(process.env.ZENMUX_API_KEY?.trim()) || isAIConfigured()
}

export function tutorModelName(): string | null {
  return process.env.ZENMUX_API_KEY?.trim()
    ? (process.env.ZENMUX_MODEL?.trim() || 'openai/gpt-5')
    : (isAIConfigured() ? process.env.AI_MODEL! : null)
}

async function callModel<T>(system: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, schema: z.ZodType<T>, useZenMux = false, selectedModel?: string): Promise<T> {
  if (!(useZenMux ? process.env.ZENMUX_API_KEY?.trim() : isAIConfigured())) throw new AIConfigurationError()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)
  try {
    const baseUrl = useZenMux ? 'https://zenmux.ai/api/v1' : process.env.AI_BASE_URL!.replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useZenMux ? process.env.ZENMUX_API_KEY!.trim() : process.env.AI_API_KEY}` },
      body: JSON.stringify({
        model: useZenMux ? (selectedModel || tutorModelName()) : process.env.AI_MODEL,
        stream: false,
        // Some reasoning models reject custom temperature values; use provider defaults.
        ...(useZenMux ? {} : { temperature: 0.3 }),
        messages: [{ role: 'system', content: `${system}\n只返回合法 JSON，不要输出 Markdown 代码围栏。` }, ...messages],
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`AI_UPSTREAM_${response.status}`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('AI_EMPTY_RESPONSE')
    const json = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    return schema.parse(JSON.parse(json))
  } finally {
    clearTimeout(timeout)
  }
}

export async function setMemory(userId: string, agentType: string, key: string, value: unknown) {
  return prisma.agentMemory.upsert({
    where: { userId_agentType_key: { userId, agentType, key } },
    create: { userId, agentType, key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  })
}

export async function getMemory(userId: string, agentType: string, key: string): Promise<unknown | null> {
  const memory = await prisma.agentMemory.findUnique({ where: { userId_agentType_key: { userId, agentType, key } } })
  return memory?.value ?? null
}

const previewSchema = z.object({
  script: z.string().min(20).max(20_000),
  keyPoints: z.array(z.string().min(1)).min(1).max(20),
  difficulties: z.array(z.string().min(1)).max(20),
  previewQuestions: z.array(z.string().min(1)).max(20),
})

export async function generatePreClassPreview(input: { subject?: string; topic?: string; materials: string; teachingStyle?: string; gradeLevel?: string; durationMinutes?: number }) {
  return callModel(
    '你是课前预习设计助手。依据教师提供的真实教材生成预习，不能编造教材没有的信息。返回 script、keyPoints、difficulties、previewQuestions。',
    [{ role: 'user', content: JSON.stringify(input) }],
    previewSchema
  )
}

const tutorSchema = z.object({
  answer: z.string().min(1).max(10_000),
  guidingQuestions: z.array(z.string()).transform(items => items.slice(0, 10)),
  practiceExercises: z.array(z.object({ question: z.string(), options: z.array(z.string()).optional(), answer: z.string(), explanation: z.string() })).transform(items => items.slice(0, 5)),
  encouragement: z.string().transform(value => value.slice(0, 1000)),
  // Providers may ignore requested array limits. Truncate instead of throwing away a good answer.
  videoKeywords: z.array(z.string().max(100)).default([]).transform(items => items.slice(0, 3)),
})

export async function studentTutorChatNonStream(userId: string, message: string, history: Array<{ role: string; content: string }>, subject?: string, selectedModel?: string) {
  const safeHistory = history.slice(-30).filter((item): item is { role: 'user' | 'assistant'; content: string } => item.role === 'user' || item.role === 'assistant')
  const response = await callModel(
    `你是学生的一对一辅导老师，学科为${subject || '通用'}。通过启发式问题帮助理解，避免只给最终答案。返回 JSON：answer 为回答字符串，guidingQuestions 为字符串数组，practiceExercises 为数组（每项 question、answer、explanation 为字符串，options 为可选字符串数组），encouragement 为鼓励字符串，videoKeywords 为 1-3 个简短中文知识点搜索词。`,
    [...safeHistory, { role: 'user', content: message }],
    tutorSchema,
    Boolean(process.env.ZENMUX_API_KEY?.trim()),
    selectedModel
  )
  await setMemory(userId, 'STUDENT', 'last_tutor_response', response)
  return response
}

export async function studentTutorChatStream(message: string, history: Array<{ role: string; content: string }>, subject: string | undefined, model: string | undefined, onText: (text: string) => void, signal: AbortSignal) {
  if (!isTutorAIConfigured()) throw new AIConfigurationError()
  const zenmux = Boolean(process.env.ZENMUX_API_KEY?.trim())
  const base = zenmux ? 'https://zenmux.ai/api/v1' : process.env.AI_BASE_URL!.replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zenmux ? process.env.ZENMUX_API_KEY!.trim() : process.env.AI_API_KEY}` },
    body: JSON.stringify({ model: zenmux ? model || tutorModelName() : process.env.AI_MODEL, stream: true,
      messages: [{ role: 'system', content: `你是一对一辅导老师，学科为${subject || '通用'}。启发式教学，避免只给最终答案。只返回合法JSON，必须先输出answer字段。格式：{"answer":"解释正文","guidingQuestions":[],"practiceExercises":[{"question":"题目","options":[],"answer":"答案","explanation":"解析"}],"encouragement":"鼓励","videoKeywords":["中文知识点"]}。` },
        ...history.slice(-30).filter(m => m.role === 'user' || m.role === 'assistant'), { role: 'user', content: message }],
    }),
  })
  if (!response.ok) throw new Error(`AI_UPSTREAM_${response.status}`)
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('AI_INVALID_STREAM')
  let text = ''
  let finished = false
  await consumeSSE(response.body, data => {
    if (data.trim() === '[DONE]') { finished = true; return }
    const chunk = JSON.parse(data)
    if (chunk.error) throw new Error('AI_STREAM_ERROR')
    const choice = chunk.choices?.[0]
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new Error('AI_INCOMPLETE_RESPONSE')
    const delta = choice?.delta?.content
    if (typeof delta === 'string') {
      text += delta
      if (text.length > 100000) throw new Error('AI_RESPONSE_TOO_LARGE')
      onText(text)
    }
  })
  if (!finished) throw new Error('AI_INCOMPLETE_RESPONSE')
  return tutorSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')))
}

const parentReportSchema = z.object({
  strengths: z.array(z.string()).max(20),
  areasToSupport: z.array(z.string()).max(20),
  homeActivities: z.array(z.string()).max(20),
  encouragementMessage: z.string().max(3000),
})

export async function generateParentReport(studentId: string, weekStart: Date, weekEnd: Date, studentName: string) {
  const [submissions, emotions, attendance] = await Promise.all([
    prisma.submission.findMany({ where: { userId: studentId, createdAt: { gte: weekStart, lt: weekEnd } }, select: { score: true, createdAt: true } }),
    prisma.emotionLog.findMany({ where: { userId: studentId, timestamp: { gte: weekStart, lt: weekEnd } }, select: { emotion: true, timestamp: true } }),
    prisma.attendance.findMany({ where: { userId: studentId, joinedAt: { gte: weekStart, lt: weekEnd } }, select: { joinedAt: true, leftAt: true } }),
  ])
  return callModel(
    '你是家长学习报告助手。只依据提供的数据区分事实和建议，不得虚构成绩、出勤或情绪。返回 strengths、areasToSupport、homeActivities、encouragementMessage。',
    [{ role: 'user', content: JSON.stringify({ studentName, weekStart, weekEnd, submissions, emotions, attendance }) }],
    parentReportSchema
  )
}

const analyticsSchema = z.object({
  engagementScore: z.number().min(0).max(100).nullable(),
  totalConfusions: z.number().int().min(0),
  totalSpeeches: z.number().int().min(0),
  averageQuizScore: z.number().min(0).max(100).nullable(),
  confusedMoments: z.array(z.object({ id: z.string(), timestamp: z.union([z.string(), z.date()]), topic: z.string() })).max(100),
  studentsInNeed: z.array(z.object({ id: z.string(), name: z.string(), reason: z.string(), level: z.enum(['warning', 'error']) })).max(100),
  suggestedAdjustments: z.array(z.string()).max(30),
  quizAccuracy: z.array(z.object({ questionNumber: z.number().int().positive(), correctRate: z.number().min(0).max(100) })).max(100),
})

export async function generatePostClassAnalytics(_sessionId: string, sessionData: unknown) {
  return callModel(
    '你是课后分析助手。只依据课堂数据分析；数据不足时相关分数返回 null。返回 engagementScore、totalConfusions、totalSpeeches、averageQuizScore、confusedMoments、studentsInNeed、suggestedAdjustments、quizAccuracy。',
    [{ role: 'user', content: JSON.stringify(sessionData) }],
    analyticsSchema
  )
}

const assignmentSchema = z.object({ assignments: z.record(z.string(), z.string()) })
export async function assignRoles(scenario: { roles: Array<{ id?: string; name: string }> }, students: StudentForAssignment[]) {
  return callModel(
    '你是课堂角色分配助手。只能使用给定 studentId 和角色 id/name，每名学生分配一个角色。返回 assignments 对象。',
    [{ role: 'user', content: JSON.stringify({ scenario, students }) }],
    assignmentSchema
  )
}

const generatedQuestionSchema = z.object({
  type: z.enum(['single_choice', 'multiple_choice', 'true_false', 'short_answer']),
  text: z.string().min(1).max(5000),
  options: z.array(z.string().min(1).max(500)).max(10).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
  points: z.number().int().min(1).max(100).default(1),
  explanation: z.string().max(5000).default(''),
})

export async function generateQuizDraft(input: { material: string; count: number; difficulty?: string }) {
  const result = await callModel(
    '你是测验出题助手。题目必须来自教材。correctAnswer 对客观题使用选项文字，对简答题使用答案文本。返回 title、questions。',
    [{ role: 'user', content: JSON.stringify(input) }],
    z.object({ title: z.string().min(1).max(200), questions: z.array(generatedQuestionSchema).min(1).max(20) })
  )
  return {
    title: result.title,
    questions: result.questions.map((question) => {
      const optionValues = question.options || []
      const options = optionValues.map((text) => ({ id: randomUUID(), text }))
      const answerValues = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]
      const answerIds = answerValues.map((answer) => options.find((option) => option.text === answer)?.id || answer)
      return {
        id: randomUUID(),
        type: question.type,
        text: question.text,
        options: question.type === 'short_answer' ? undefined : options,
        correctAnswer: question.type === 'multiple_choice' ? answerIds : answerIds[0],
        points: question.points,
        explanation: question.explanation,
      }
    }),
  }
}
