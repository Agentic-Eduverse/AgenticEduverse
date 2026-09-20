import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

// Recordings are produced in the teacher's browser (see lib/browser-recorder.ts) and
// streamed here. They land on local disk under the same upload root as class materials.
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(process.cwd(), 'data', 'uploads')
const MAX_BYTES = 1024 * 1024 * 1024 // 1 GiB safety ceiling
const ALLOWED_MIME = new Set(['video/webm', 'video/mp4', 'application/octet-stream'])

function extensionFor(contentType: string): string {
  if (contentType.includes('mp4')) return 'mp4'
  return 'webm'
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireRole('TEACHER')

    const recording = await prisma.recording.findUnique({
      where: { id: params.id },
      include: { class: { select: { teacherId: true } } },
    })
    if (!recording) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '录制记录不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    }
    if (recording.class.teacherId !== teacher.id) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权上传该课堂录像', statusCode: 403 } as ApiResponse, { status: 403 })
    }
    if (!['STARTING', 'ACTIVE', 'STOPPING'].includes(recording.status)) {
      return NextResponse.json({ success: false, error: 'NOT_RECORDING', message: '该录制不在进行中', statusCode: 409 } as ApiResponse, { status: 409 })
    }
    if (!request.body) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '缺少录制数据', statusCode: 400 } as ApiResponse, { status: 400 })
    }

    const contentType = (request.headers.get('content-type') || 'video/webm').split(';')[0].trim()
    if (!ALLOWED_MIME.has(contentType)) {
      return NextResponse.json({ success: false, error: 'INVALID_TYPE', message: '不支持的录像格式', statusCode: 400 } as ApiResponse, { status: 400 })
    }
    const declaredLength = Number(request.headers.get('content-length') || 0)
    if (declaredLength > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'TOO_LARGE', message: '录像文件过大', statusCode: 413 } as ApiResponse, { status: 413 })
    }

    const relativePath = path.join('recordings', recording.classId, `${recording.id}.${extensionFor(contentType)}`)
    const absolutePath = path.join(UPLOAD_ROOT, relativePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })

    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(absolutePath))

    const written = await stat(absolutePath)
    if (written.size < 1) {
      return NextResponse.json({ success: false, error: 'EMPTY_UPLOAD', message: '录像内容为空', statusCode: 400 } as ApiResponse, { status: 400 })
    }

    const updated = await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: 'COMPLETE',
        endedAt: recording.endedAt ?? new Date(),
        fileUrl: relativePath.split(path.sep).join('/'),
      },
    })

    return NextResponse.json({
      success: true,
      data: { recording: updated, size: written.size },
      message: '录像已保存',
      statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const message = error instanceof Error && error.message === '未登录' ? '未登录' : '录像保存失败'
    console.error('[recording-upload] failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'UPLOAD_FAILED', message, statusCode: message === '未登录' ? 401 : 500 } as ApiResponse,
      { status: message === '未登录' ? 401 : 500 }
    )
  }
}
