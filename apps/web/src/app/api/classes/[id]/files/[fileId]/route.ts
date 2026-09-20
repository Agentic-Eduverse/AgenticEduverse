import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { getCurrentUser } from '@/lib/auth-utils'

export async function GET(_request: Request, { params }: { params: { id: string; fileId: string } }) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const file = await prisma.classFile.findUnique({ where: { id: params.fileId }, include: { class: { select: { teacherId: true } } } })
  if (!file || file.classId !== params.id) return new NextResponse('Not found', { status: 404 })
  const enrolled = user.role === 'STUDENT' ? await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: user.id, classId: params.id } } }) : null
  if (file.class.teacherId !== user.id && !enrolled) return new NextResponse('Forbidden', { status: 403 })
  try {
    const contents = await readFile(file.storagePath)
    return new NextResponse(contents, { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'private, max-age=60' } })
  } catch { return new NextResponse('File missing', { status: 410 }) }
}
