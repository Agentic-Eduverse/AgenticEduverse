import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { isLinkedParent, listLinkedChildren } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

export async function GET(request: Request) {
  try {
    const parent = await requireRole('PARENT')
    const url = new URL(request.url)
    const studentId = url.searchParams.get('studentId') || ''
    const weekStart = new Date(`${url.searchParams.get('weekStart') || ''}T00:00:00.000Z`)
    if (!studentId || Number.isNaN(weekStart.getTime()) || !(await isLinkedParent(parent.id, studentId))) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该学生数据', statusCode: 403 } as ApiResponse, { status: 403 })
    }
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
    const [children, attendance, emotions, submissions, rewards] = await Promise.all([
      listLinkedChildren(parent.id),
      prisma.attendance.findMany({ where: { userId: studentId, joinedAt: { gte: weekStart, lt: weekEnd } }, select: { joinedAt: true, leftAt: true } }),
      prisma.emotionLog.findMany({ where: { userId: studentId, timestamp: { gte: weekStart, lt: weekEnd } }, select: { emotion: true, timestamp: true } }),
      prisma.submission.findMany({ where: { userId: studentId, createdAt: { gte: weekStart, lt: weekEnd } }, select: { score: true, quiz: { select: { class: { select: { name: true } } } } } }),
      prisma.rewardLedger.findMany({ where: { userId: studentId, createdAt: { gte: weekStart, lt: weekEnd } }, select: { amount: true } }),
    ])
    const scores = submissions.map((item) => item.score).filter((score): score is number => score !== null)
    const byDate = new Map<string, { happy: number; confused: number }>()
    for (const emotion of emotions) {
      const date = emotion.timestamp.toISOString().slice(0, 10)
      const entry = byDate.get(date) || { happy: 0, confused: 0 }
      if (emotion.emotion === 'happy' || emotion.emotion === 'idea' || emotion.emotion === 'have_idea') entry.happy += 1
      if (emotion.emotion === 'confused' || emotion.emotion === 'repeat' || emotion.emotion === 'need_repeat') entry.confused += 1
      byDate.set(date, entry)
    }
    const subjectMap = new Map<string, number[]>()
    for (const submission of submissions) {
      if (submission.score === null) continue
      const subject = submission.quiz.class.name
      subjectMap.set(subject, [...(subjectMap.get(subject) || []), submission.score])
    }
    return NextResponse.json({
      success: true,
      data: {
        children,
        attendanceCount: attendance.length,
        attendanceMinutes: attendance.reduce((sum, item) => sum + (item.leftAt ? Math.max(0, item.leftAt.getTime() - item.joinedAt.getTime()) : 0), 0) / 60_000,
        emotionFeedbacks: emotions.length,
        averageQuizScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
        coinsEarned: rewards.reduce((sum, reward) => sum + reward.amount, 0),
        emotionTrend: Array.from(byDate, ([date, values]) => ({ date, ...values })),
        subjectScores: Array.from(subjectMap, ([subject, values]) => ({ subject, score: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) })),
      },
      message: '家长看板获取成功',
      statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const status = error instanceof Error && error.message === '未登录' ? 401 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : '获取家长看板失败', statusCode: status } as ApiResponse, { status })
  }
}
