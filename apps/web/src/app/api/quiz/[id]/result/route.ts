import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse, QuizQuestion, QuizResponse } from '@eduverse/shared'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const student = await requireRole('STUDENT')
    const quiz = await prisma.quiz.findUnique({
      where: { id: params.id },
      include: { submissions: { where: { userId: student.id }, take: 1 } },
    })
    if (!quiz) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '测验不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    const enrollment = await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: student.id, classId: quiz.classId } }, select: { id: true } })
    if (!enrollment) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该测验', statusCode: 403 } as ApiResponse, { status: 403 })
    if (quiz.status !== 'ENDED') return NextResponse.json({ success: false, error: 'QUIZ_NOT_ENDED', message: '测验结束后才能查看答案与解析', statusCode: 409 } as ApiResponse, { status: 409 })
    const submission = quiz.submissions[0]
    if (!submission) return NextResponse.json({ success: false, error: 'NO_SUBMISSION', message: '未找到你的答题记录', statusCode: 404 } as ApiResponse, { status: 404 })
    const response: QuizResponse = {
      id: quiz.id, classId: quiz.classId, title: quiz.title,
      questions: quiz.questions as unknown as QuizQuestion[], createdBy: quiz.createdBy,
      createdAt: quiz.createdAt, isActive: false, timeLimitSeconds: quiz.timeLimitSeconds,
      startedAt: quiz.startedAt || undefined, sessionId: quiz.sessionId || undefined,
    }
    return NextResponse.json({
      success: true,
      data: { quiz: response, result: { score: submission.score, rawScore: submission.rawScore, totalPoints: submission.totalPoints, correctCount: submission.correctCount } },
      message: '获取本人测验结果成功', statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取测验结果失败'
    const status = message === '未登录' ? 401 : message.startsWith('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, error: status === 500 ? 'INTERNAL_ERROR' : message, message: status === 500 ? '获取测验结果失败' : message, statusCode: status } as ApiResponse, { status })
  }
}
