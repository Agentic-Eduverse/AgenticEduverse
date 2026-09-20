import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

export async function GET() {
  try {
    const student = await requireRole('STUDENT')
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [submissions, attendance, rewards] = await Promise.all([
      prisma.submission.findMany({ where: { userId: student.id, createdAt: { gte: start } }, select: { score: true } }),
      prisma.attendance.findMany({ where: { userId: student.id, joinedAt: { gte: start } }, select: { joinedAt: true, leftAt: true } }),
      prisma.rewardLedger.aggregate({ where: { userId: student.id, createdAt: { gte: start } }, _sum: { amount: true } }),
    ])
    const scores = submissions.map((item) => item.score).filter((score): score is number => score !== null)
    const minutes = attendance.reduce((sum, item) => sum + (item.leftAt ? Math.max(0, item.leftAt.getTime() - item.joinedAt.getTime()) : 0), 0) / 60_000
    return NextResponse.json({ success: true, data: { studyMinutes: Math.round(minutes), accuracy: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, rewards: rewards._sum.amount || 0, coins: student.coins, weakPoints: [] }, message: '学习统计获取成功', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const status = error instanceof Error && error.message === '未登录' ? 401 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : '获取学习统计失败', statusCode: status } as ApiResponse, { status })
  }
}
