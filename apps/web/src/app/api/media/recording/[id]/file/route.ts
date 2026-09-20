import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { getCurrentUser } from '@/lib/auth-utils'

// Recordings are stored on local disk (see the upload route). The original implementation
// streamed from MinIO/S3; this keeps the same authenticated, range-capable contract so the
// player's seeking behaviour is unchanged.
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(process.cwd(), 'data', 'uploads')

function contentTypeFor(filePath: string): string {
  return filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
}

function resolveWithinRoot(relativePath: string): string | null {
  const absolute = path.resolve(UPLOAD_ROOT, relativePath)
  const root = path.resolve(UPLOAD_ROOT)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null
  return absolute
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    include: { class: { select: { teacherId: true } } },
  })
  if (!recording || recording.status !== 'COMPLETE' || !recording.fileUrl) {
    return new NextResponse('not found', { status: 404 })
  }

  const isTeacher = recording.class.teacherId === user.id
  const enrollment = !isTeacher
    ? await prisma.enrollment.findUnique({
        where: { studentId_classId: { studentId: user.id, classId: recording.classId } },
        select: { id: true },
      })
    : null
  if (!isTeacher && (!enrollment || !recording.publishedAt)) return new NextResponse('forbidden', { status: 403 })

  const absolutePath = resolveWithinRoot(recording.fileUrl)
  if (!absolutePath) return new NextResponse('invalid path', { status: 400 })

  let fileStat: Awaited<ReturnType<typeof stat>>
  try {
    fileStat = await stat(absolutePath)
  } catch {
    return new NextResponse('storage unavailable', { status: 502 })
  }
  if (!fileStat.isFile() || fileStat.size === 0) return new NextResponse('storage unavailable', { status: 502 })

  const total = fileStat.size
  const range = request.headers.get('range')
  let start = 0
  let end = total - 1
  let status = 200

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
    start = match[1] ? Number(match[1]) : 0
    end = match[2] ? Number(match[2]) : total - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
    }
    end = Math.min(end, total - 1)
    status = 206
  }

  const stream = createReadStream(absolutePath, { start, end })
  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status,
    headers: {
      'Content-Type': contentTypeFor(absolutePath),
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {}),
      'Cache-Control': 'private, max-age=60',
    },
  })
}
