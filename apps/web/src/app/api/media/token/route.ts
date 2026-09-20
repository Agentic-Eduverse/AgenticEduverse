import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { getCurrentUser } from '@/lib/auth-utils'
import { createMediaToken } from '@/lib/media-auth'
import type { ApiResponse } from '@eduverse/shared'

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
    const { classId, tutoringId } = await request.json() as { classId?: string; tutoringId?: string }
    if (!classId) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '缺少班级 ID', statusCode: 400 } as ApiResponse, { status: 400 })
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true, isLive: true } })
    if (!cls) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '班级不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    const enrolled = user.role === 'STUDENT' ? await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: user.id, classId } }, select: { id: true } }) : null
    if (cls.teacherId !== user.id && !enrolled) {
      // Name the missing relationship: a bare "无权加入" left teachers who opened another
      // teacher's class with no idea what went wrong.
      const message = user.role === 'TEACHER'
        ? '你不是该班级的授课教师，无法进入该班级的音视频课堂'
        : user.role === 'STUDENT'
          ? '你尚未加入该班级，请先用房间码加入班级后再进入课堂'
          : '家长账号无法进入音视频课堂'
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message, statusCode: 403 } as ApiResponse, { status: 403 })
    }
    if (!cls.isLive) return NextResponse.json({ success: false, error: 'CLASS_NOT_LIVE', message: '课堂尚未开始或已经结束', statusCode: 409 } as ApiResponse, { status: 409 })
    let roomName = `class-${classId}`
    let canPublish = user.role === 'TEACHER'
    if (tutoringId) {
      const tutoring = await prisma.tutoringSession.findUnique({ where: { id: tutoringId } })
      if (!tutoring || tutoring.classId !== classId || tutoring.status !== 'ACTIVE' || (tutoring.teacherId !== user.id && tutoring.studentId !== user.id)) {
        return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权加入该私密辅导房间', statusCode: 403 } as ApiResponse, { status: 403 })
      }
      roomName = `tutoring-${tutoring.id}`
      canPublish = true
    }
    const token = await createMediaToken({ identity: user.id, name: user.name, roomName, canPublish })
    return NextResponse.json({ success: true, data: { token, url: process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL }, message: '音视频票据已签发', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const configured = !(error instanceof Error && error.message === 'MEDIA_NOT_CONFIGURED')
    return NextResponse.json({ success: false, error: configured ? 'MEDIA_ERROR' : 'MEDIA_NOT_CONFIGURED', message: configured ? '音视频票据签发失败' : '音视频服务尚未配置', statusCode: configured ? 500 : 503 } as ApiResponse, { status: configured ? 500 : 503 })
  }
}
