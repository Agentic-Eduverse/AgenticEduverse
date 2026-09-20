import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-utils'
import { AIConfigurationError, studentTutorChatNonStream, studentTutorChatStream, setMemory } from '@eduverse/ai'
import type { ApiResponse, ChatMessage, StudentTutorResponse } from '@eduverse/shared'
import { takeRateLimit } from '@/lib/rate-limit'
import { withTimeout } from '@/lib/async-utils'
import { getTutorModels } from '@/lib/tutor-models'
import { extractPartialAnswer } from '@/lib/stream-json-answer'
import { normalizeTutorAgent, readTutorHistory, tutorHistoryKey, TUTOR_HISTORY_LIMIT } from '@/lib/tutor-history'

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(10000),
  timestamp: z.string().optional(),
})

const tutorSchema = z.object({
  message: z.string().min(1, '消息不能为空').max(2000, '消息过长，请简化问题'),
  history: z.array(chatMessageSchema).max(50, '历史消息过多').default([]),
  contextClassId: z.string().optional(),
  subject: z.string().max(50).optional(),
  // Which companion the question was asked of; history is bucketed per companion.
  agentId: z.string().max(30).optional(),
  model: z.string().min(1).max(160).optional(),
  stream: z.boolean().default(false),
})

export async function GET(request: Request) {
  try {
    const user = await requireRole('STUDENT')
    const agentId = normalizeTutorAgent(new URL(request.url).searchParams.get('agentId'))
    const history = await readTutorHistory(user.id, agentId)
    return NextResponse.json({
      success: true,
      data: { history, agentId },
      message: '获取辅导历史成功',
      statusCode: 200,
    } as ApiResponse<{ history: typeof history; agentId: string }>)
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取辅导历史失败'
    const status = message === '未登录' ? 401 : message.startsWith('权限不足') ? 403 : 500
    return NextResponse.json({
      success: false,
      error: status === 500 ? 'INTERNAL_ERROR' : message,
      message: status === 500 ? '获取辅导历史失败' : message,
      statusCode: status,
    } as ApiResponse, { status })
  }
}

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

    const body = await request.json()
    if (!takeRateLimit(`ai-tutor:${user.id}`, 20, 60_000)) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', statusCode: 429 } as ApiResponse, { status: 429 })
    }
    const validated = tutorSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { message, history, contextClassId, subject } = validated.data
    const agentId = normalizeTutorAgent(validated.data.agentId)

    const historyMessages: ChatMessage[] = history.map((h) => ({
      role: h.role,
      content: h.content,
      timestamp: h.timestamp ? new Date(h.timestamp) : undefined,
    }))

    const selectedModel = validated.data.model
    if (selectedModel) {
      const directory = await getTutorModels()
      if (!directory.enabled || !directory.models.some(m => m.id === selectedModel)) {
        return NextResponse.json({ success: false, error: 'INVALID_MODEL', message: '该模型不在可选列表中，请刷新模型列表', statusCode: 400 }, { status: 400 })
      }
    }
    if (validated.data.stream) {
      const abort = new AbortController()
      const onAbort = () => abort.abort()
      request.signal.addEventListener('abort', onAbort, { once: true })
      if (request.signal.aborted) abort.abort()
      const timeout = setTimeout(() => abort.abort(), 120000)
      const encoder = new TextEncoder()
      let cancelled = false
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (data: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) }
          let previous = ''
          try {
            const result = await studentTutorChatStream(message, historyMessages, subject, selectedModel, text => {
              const answer = extractPartialAnswer(text)?.value
              if (answer !== undefined && answer !== previous) { previous = answer; emit({ type: 'answer', text: answer }) }
            }, abort.signal)
            if (abort.signal.aborted) throw new Error('AI_ABORTED')
            let saved = true
            try {
              const history = await readTutorHistory(user.id, agentId)
              await setMemory(user.id, 'STUDENT', tutorHistoryKey(agentId), [...history, {
                userMessage: message, subject: subject || null, contextClassId: contextClassId || null,
                response: result, timestamp: new Date().toISOString(),
              }].slice(-TUTOR_HISTORY_LIMIT))
            } catch { saved = false }
            emit({ type: 'complete', tutor: result, saved })
          } catch {
            emit({ type: 'error', message: abort.signal.aborted ? '回答超时或已取消，部分内容未保存，请重试。' : '回答生成中断，部分内容未保存，请重试。' })
          } finally {
            clearTimeout(timeout)
            request.signal.removeEventListener('abort', onAbort)
            if (!cancelled) controller.close()
          }
        },
        cancel() { cancelled = true; abort.abort() },
      })
      return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
    }
    const result: StudentTutorResponse = await withTimeout(studentTutorChatNonStream(
      user.id,
      message,
      historyMessages,
      subject,
      selectedModel
    ), 55_000)

    try {
      const tutorHistory = await readTutorHistory(user.id, agentId)

      const newEntry = {
        userMessage: message,
        contextClassId: contextClassId || null,
        subject: subject || null,
        response: {
          answer: result.answer,
          guidingQuestions: result.guidingQuestions,
          practiceExercises: result.practiceExercises,
          encouragement: result.encouragement,
        },
        timestamp: new Date().toISOString(),
      }

      const trimmed = [...tutorHistory, newEntry].slice(-TUTOR_HISTORY_LIMIT)
      await setMemory(user.id, 'STUDENT', tutorHistoryKey(agentId), trimmed)
    } catch {
      // Memory persistence failure should not fail the main request
    }

    return NextResponse.json(
      {
        success: true,
        data: { tutor: result },
        message: 'AI 辅导回复生成成功',
        statusCode: 200,
      } as ApiResponse<{ tutor: StudentTutorResponse }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    if (error instanceof AIConfigurationError || error.message === 'AI_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: 'AI_NOT_CONFIGURED', message: 'AI 尚未配置，请先设置模型服务', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    const upstreamErrors: Record<string, string> = {
      AI_UPSTREAM_401: '模型服务密钥无效，请管理员检查 API Key',
      AI_UPSTREAM_403: '模型服务拒绝访问，请检查账号权限和模型授权',
      AI_UPSTREAM_402: '模型服务余额不足，请检查账户额度',
      AI_UPSTREAM_429: '模型服务限流，请稍后重试',
      AI_UPSTREAM_404: '模型或接口不存在，请检查模型 ID',
    }
    if (upstreamErrors[error.message]) {
      return NextResponse.json({ success: false, error: error.message, message: upstreamErrors[error.message], statusCode: 502 } as ApiResponse, { status: 502 })
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'AI 辅导失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
