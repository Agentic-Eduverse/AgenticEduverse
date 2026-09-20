import { NextResponse } from 'next/server'
import { prisma, Prisma } from '@eduverse/db'
import { getCurrentUser, requireRole } from '@/lib/auth-utils'
import { mediaConfigured } from '@/lib/media-auth'
import type { ApiResponse } from '@eduverse/shared'

// Recording happens in the teacher's browser (see lib/browser-recorder.ts) instead of in a
// LiveKit Egress worker: Egress is published only as a Docker image that bundles GStreamer
// and a Chrome build, and this host has no Docker (WSL is blocked too). These endpoints
// therefore only bookkeep the recording session - the media itself is streamed to
// /api/media/recording/[id]/upload by the client, which also flips the row to COMPLETE.
//
// Because the recorder lives in a browser tab, a row can be orphaned at any moment by a
// crash, a reload or a closed tab. The client pings `heartbeat` while recording; a row whose
// heartbeat has gone quiet is garbage-collected instead of blocking every later recording
// with a permanent "该课堂已在录制".

const IN_PROGRESS = ['STARTING', 'ACTIVE']
/** Heartbeat interval on the client is 20s; allow a generous multiple before declaring death. */
const HEARTBEAT_STALE_MS = 5 * 60 * 1000

function isStale(recording: { heartbeatAt: Date | null; startedAt: Date }): boolean {
  const lastSeen = (recording.heartbeatAt ?? recording.startedAt).getTime()
  return Date.now() - lastSeen > HEARTBEAT_STALE_MS
}

export async function POST(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    if (!mediaConfigured()) {
      return NextResponse.json({ success: false, error: 'MEDIA_NOT_CONFIGURED', message: '音视频服务尚未配置', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    const body = await request.json() as { action?: 'start' | 'stop' | 'publish' | 'heartbeat'; classId?: string; recordingId?: string }
    if (body.action === 'start' && body.classId) {
      const cls = await prisma.class.findUnique({ where: { id: body.classId }, select: { teacherId: true, isLive: true } })
      if (!cls || cls.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权录制该课堂', statusCode: 403 } as ApiResponse, { status: 403 })
      if (!cls.isLive) return NextResponse.json({ success: false, error: 'CLASS_NOT_LIVE', message: '课堂未开始，不能录制', statusCode: 409 } as ApiResponse, { status: 409 })

      const inProgress = await prisma.recording.findMany({
        where: { classId: body.classId, status: { in: IN_PROGRESS } },
        select: { id: true, heartbeatAt: true, startedAt: true },
      })
      const abandoned = inProgress.filter(isStale)
      if (abandoned.length) {
        await prisma.recording.updateMany({
          where: { id: { in: abandoned.map((row) => row.id) } },
          data: { status: 'FAILED', endedAt: new Date() },
        })
      }
      if (inProgress.length > abandoned.length) {
        return NextResponse.json({ success: false, error: 'ALREADY_RECORDING', message: '该课堂已在录制', statusCode: 409 } as ApiResponse, { status: 409 })
      }

      const session = await prisma.session.findFirst({ where: { classId: body.classId, endedAt: null }, orderBy: { startedAt: 'desc' } })
      if (!session) return NextResponse.json({ success: false, error: 'SESSION_NOT_FOUND', message: '未找到进行中的课堂会话', statusCode: 409 } as ApiResponse, { status: 409 })
      const recordingStartedAt = new Date()
      const whiteboardStart = await prisma.whiteboardEvent.findMany({ where: { classId: body.classId, createdAt: { lt: recordingStartedAt } }, select: { id: true, sequence: true, action: true, payload: true, createdAt: true }, orderBy: { sequence: 'asc' }, take: 2000 })
      const recording = await prisma.recording.create({
        data: {
          classId: body.classId,
          sessionId: session.id,
          status: 'ACTIVE',
          startedAt: recordingStartedAt,
          heartbeatAt: recordingStartedAt,
          whiteboardStart: whiteboardStart as unknown as Prisma.InputJsonValue,
        },
      })
      // fileUrl stays empty here - the browser fills it in when the upload completes.
      return NextResponse.json({
        success: true,
        data: { recording },
        message: '录制已开始，请在录制期间保持课堂页面打开',
        statusCode: 200,
      } as ApiResponse)
    }
    if (body.action === 'heartbeat' && body.recordingId) {
      const recording = await prisma.recording.findUnique({ where: { id: body.recordingId }, include: { class: { select: { teacherId: true } } } })
      if (!recording || recording.class.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权更新该录制', statusCode: 403 } as ApiResponse, { status: 403 })
      if (!IN_PROGRESS.includes(recording.status)) return NextResponse.json({ success: false, error: 'NOT_RECORDING', message: '录制已结束', statusCode: 409 } as ApiResponse, { status: 409 })
      await prisma.recording.update({ where: { id: recording.id }, data: { heartbeatAt: new Date() } })
      return NextResponse.json({ success: true, data: { ok: true }, message: '心跳已更新', statusCode: 200 } as ApiResponse)
    }
    if (body.action === 'stop' && body.recordingId) {
      const recording = await prisma.recording.findUnique({ where: { id: body.recordingId }, include: { class: { select: { teacherId: true } } } })
      if (!recording || recording.class.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权停止该录制', statusCode: 403 } as ApiResponse, { status: 403 })
      if (recording.status !== 'ACTIVE' && recording.status !== 'STARTING') return NextResponse.json({ success: false, error: 'NOT_RECORDING', message: '录制未在进行', statusCode: 409 } as ApiResponse, { status: 409 })
      // The happy path never reaches here: the client stops its recorder and uploads the
      // file, which marks the row COMPLETE. This endpoint is the failure/cancel path.
      const updated = await prisma.recording.update({ where: { id: recording.id }, data: { status: 'FAILED', endedAt: new Date() } })
      return NextResponse.json({ success: true, data: { recording: updated }, message: '录制已取消', statusCode: 200 } as ApiResponse)
    }
    if (body.action === 'publish' && body.recordingId) {
      const recording = await prisma.recording.findUnique({ where: { id: body.recordingId }, include: { class: { select: { teacherId: true } } } })
      if (!recording || recording.class.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权发布该录像', statusCode: 403 } as ApiResponse, { status: 403 })
      if (recording.status !== 'COMPLETE' || !recording.fileUrl) return NextResponse.json({ success: false, error: 'NOT_READY', message: '录像尚未处理完成', statusCode: 409 } as ApiResponse, { status: 409 })
      const updated = await prisma.recording.update({ where: { id: recording.id }, data: { publishedAt: recording.publishedAt || new Date() } })
      return NextResponse.json({ success: true, data: { recording: updated }, message: '录像已向本班学生发布', statusCode: 200 } as ApiResponse)
    }
    return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '录制操作无效', statusCode: 400 } as ApiResponse, { status: 400 })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'MEDIA_ERROR', message: '录制服务操作失败', statusCode: 502 } as ApiResponse, { status: 502 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
    const classId = new URL(request.url).searchParams.get('classId') || ''
    const classroom = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!classroom) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '班级不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    const isTeacher = classroom.teacherId === user.id
    const enrollment = !isTeacher ? await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: user.id, classId } }, select: { id: true } }) : null
    if (!isTeacher && !enrollment) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该班级录像', statusCode: 403 } as ApiResponse, { status: 403 })
    const recordings = await prisma.recording.findMany({
      where: { classId, ...(isTeacher ? {} : { status: 'COMPLETE', publishedAt: { not: null } }) },
      select: { id: true, status: true, startedAt: true, endedAt: true, publishedAt: true },
      orderBy: { startedAt: 'desc' }, take: 50,
    })
    return NextResponse.json({ success: true, data: { recordings, canPublish: isTeacher }, message: '获取课堂录像成功', statusCode: 200 } as ApiResponse)
  } catch {
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: '获取课堂录像失败', statusCode: 500 } as ApiResponse, { status: 500 })
  }
}
