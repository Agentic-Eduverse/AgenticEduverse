import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-utils'
import { setMemory } from '@eduverse/ai'
import type { ApiResponse } from '@eduverse/shared'
import { takeRateLimit } from '@/lib/rate-limit'
import { normalizeTutorAgent, readTutorHistory, tutorHistoryKey, TUTOR_HISTORY_LIMIT, type TutorHistoryEntry } from '@/lib/tutor-history'

const entrySchema = z.object({
  // Which companion produced this exchange; history is bucketed per companion.
  agentId: z.string().max(30).optional(),
  userMessage: z.string().min(1).max(2000),
  subject: z.string().max(50).nullable().optional(),
  response: z.object({
    answer: z.string().min(1).max(10000),
    practiceExercises: z
      .array(
        z.object({
          question: z.string().max(2000),
          options: z.array(z.string().max(1000)).max(10).optional(),
          answer: z.string().max(2000),
          explanation: z.string().max(5000),
        })
      )
      .max(5)
      .optional(),
  }),
})

/**
 * Persists a tutor exchange that was produced elsewhere (currently the in-browser cloud
 * LLM channel). This route never calls a model itself - it only appends to the student's
 * stored history, so it is not a model proxy.
 */
export async function POST(request: Request) {
  try {
    let user
    try {
      user = await requireRole('STUDENT')
    } catch (e) {
      const err = e as Error
      if (err.message === '未登录') {
        return NextResponse.json(
          { success: false, error: '未登录', message: '请先登录', statusCode: 401 } as ApiResponse,
          { status: 401 }
        )
      }
      return NextResponse.json(
        { success: false, error: '权限不足', message: err.message, statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    if (!takeRateLimit(`ai-tutor-history:${user.id}`, 60, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', statusCode: 429 } as ApiResponse,
        { status: 429 }
      )
    }

    const body = await request.json()
    const validated = entrySchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const agentId = normalizeTutorAgent(validated.data.agentId)
    const history = await readTutorHistory(user.id, agentId)
    const newEntry: TutorHistoryEntry = {
      userMessage: validated.data.userMessage,
      subject: validated.data.subject ?? null,
      response: {
        answer: validated.data.response.answer,
        practiceExercises: validated.data.response.practiceExercises,
      },
      timestamp: new Date().toISOString(),
    }
    const trimmed = [...history, newEntry].slice(-TUTOR_HISTORY_LIMIT)
    await setMemory(user.id, 'STUDENT', tutorHistoryKey(agentId), trimmed)

    return NextResponse.json({
      success: true,
      data: { history: trimmed, agentId },
      message: '辅导历史已保存',
      statusCode: 200,
    } as ApiResponse<{ history: TutorHistoryEntry[]; agentId: string }>)
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: `保存辅导历史失败：${error.message}`, statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
