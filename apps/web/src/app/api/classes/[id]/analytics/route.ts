import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireRole('TEACHER')
    const classroom = await prisma.class.findUnique({
      where: { id: params.id },
      select: {
        name: true, teacherId: true, _count: { select: { enrollments: true } },
        sessions: {
          orderBy: { startedAt: 'desc' }, take: 20,
          select: {
            id: true, startedAt: true, endedAt: true,
            attendances: { select: { userId: true, user: { select: { role: true } } } },
            messages: { select: { role: true } },
            emotions: { select: { emotion: true } },
            quizzes: { select: { submissions: { select: { score: true } } } },
          },
        },
      },
    })
    if (!classroom) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '班级不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    if (classroom.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该班级分析', statusCode: 403 } as ApiResponse, { status: 403 })

    const sessions = classroom.sessions.slice().reverse()
    const emotionCounts: Record<string, number> = {}
    const scores: number[] = []
    let totalMessages = 0
    let totalAttendance = 0
    const timeline = sessions.map((session) => {
      const attendance = new Set(session.attendances.filter((item) => item.user.role === 'STUDENT').map((item) => item.userId)).size
      const sessionScores = session.quizzes.flatMap((quiz) => quiz.submissions)
        .flatMap((submission) => typeof submission.score === 'number' ? [submission.score] : [])
      scores.push(...sessionScores)
      session.emotions.forEach(({ emotion }) => { emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1 })
      totalMessages += session.messages.length
      totalAttendance += attendance
      return {
        id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, attendance,
        interactions: session.messages.length + session.emotions.length + sessionScores.length,
        averageQuizScore: sessionScores.length ? Math.round(sessionScores.reduce((sum, score) => sum + score, 0) / sessionScores.length) : null,
      }
    })
    const trackedSessions = sessions.length
    const enrolledStudents = classroom._count.enrollments
    const attendanceRate = trackedSessions && enrolledStudents
      ? Math.min(100, Math.round((totalAttendance / (trackedSessions * enrolledStudents)) * 100)) : null
    const averageQuizScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null

    return NextResponse.json({
      success: true,
      data: { className: classroom.name, enrolledStudents, trackedSessions, attendanceRate, totalMessages, averageQuizScore, emotionCounts, timeline },
      message: '获取课堂事实统计成功', statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取课堂分析失败'
    const status = message === '未登录' ? 401 : message.startsWith('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, error: status === 500 ? 'INTERNAL_ERROR' : message, message: status === 500 ? '获取课堂分析失败' : message, statusCode: status } as ApiResponse, { status })
  }
}
