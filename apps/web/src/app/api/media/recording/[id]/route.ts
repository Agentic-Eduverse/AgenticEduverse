import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { getCurrentUser } from '@/lib/auth-utils'
import type { ApiResponse, WhiteboardEventData } from '@eduverse/shared'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
    const recording = await prisma.recording.findUnique({ where: { id: params.id }, include: { class: { select: { id: true, name: true, teacherId: true } } } })
    if (!recording) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '录像不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    const isTeacher = recording.class.teacherId === user.id
    const enrollment = !isTeacher ? await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: user.id, classId: recording.classId } }, select: { id: true } }) : null
    if (!isTeacher && (!enrollment || !recording.publishedAt)) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该录像', statusCode: 403 } as ApiResponse, { status: 403 })
    if (recording.status !== 'COMPLETE' || !recording.fileUrl) return NextResponse.json({ success: false, error: 'NOT_READY', message: '录像尚未处理完成', statusCode: 409 } as ApiResponse, { status: 409 })
    const events = await prisma.whiteboardEvent.findMany({
      where: { classId: recording.classId, createdAt: { gte: recording.startedAt, ...(recording.endedAt ? { lte: recording.endedAt } : {}) } },
      select: { id: true, sequence: true, action: true, payload: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 5000,
    })
    return NextResponse.json({
      success: true,
      data: {
        recording: { id: recording.id, classId: recording.classId, className: recording.class.name, startedAt: recording.startedAt, endedAt: recording.endedAt, playbackUrl: `/api/media/recording/${recording.id}/file` },
        whiteboardStart: (recording.whiteboardStart || []) as unknown as WhiteboardEventData[],
        events: events as unknown as WhiteboardEventData[],
      },
      message: '获取回放成功', statusCode: 200,
    } as ApiResponse)
  } catch {
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: '获取回放失败', statusCode: 500 } as ApiResponse, { status: 500 })
  }
}
