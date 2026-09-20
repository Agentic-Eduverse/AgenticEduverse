import { NextResponse } from 'next/server'
import { prisma, Prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { AIConfigurationError, generatePostClassAnalytics } from '@eduverse/ai'
import type { ApiResponse, AnalyticsResponse, SessionData } from '@eduverse/shared'
import { withTimeout } from '@/lib/async-utils'
import { takeRateLimit } from '@/lib/rate-limit'

export async function POST(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    let user
    try {
      user = await requireRole('TEACHER')
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

    const sessionId = params.sessionId
    if (!takeRateLimit(`ai-analytics:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED', message: '分析请求过于频繁，请稍后再试', statusCode: 429 } as ApiResponse, { status: 429 })
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        class: {
          include: {
            teacher: { select: { id: true } },
            quizzes: {
              include: {
                submissions: {
                  select: {
                    userId: true,
                    score: true,
                  },
                },
              },
            },
          },
        },
        emotions: {
          select: {
            userId: true,
            emotion: true,
            timestamp: true,
          },
          orderBy: { timestamp: 'asc' },
        },
        messages: {
          select: {
            userId: true,
            role: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话不存在', message: '未找到指定课堂会话', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    if (session.class.teacher.id !== user.id) {
      return NextResponse.json(
        { success: false, error: '无权限', message: '您不是该班级的教师', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const quizResults = session.class.quizzes.map((q) => ({
      quizId: q.id,
      title: q.title,
      submissions: q.submissions
        .filter((s) => s.score !== null && s.score !== undefined)
        .map((s) => ({
          userId: s.userId,
          score: s.score as number,
        })),
    }))

    const sessionData: SessionData = {
      sessionId: session.id,
      classId: session.classId,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      messages: session.messages.map((m) => ({
        userId: m.userId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      emotionLogs: session.emotions.map((e) => ({
        userId: e.userId,
        emotion: e.emotion,
        timestamp: e.timestamp,
      })),
      quizResults,
    }

    const result: AnalyticsResponse = await withTimeout(generatePostClassAnalytics(sessionId, sessionData), 55_000)

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        analytics: result as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: { analytics: result },
        message: '课后分析生成成功',
        statusCode: 200,
      } as ApiResponse<{ analytics: AnalyticsResponse }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    if (error instanceof AIConfigurationError || error.message === 'AI_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: 'AI_NOT_CONFIGURED', message: 'AI 尚未配置，请先设置模型服务', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '生成课后分析失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
