import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { getCurrentUser } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown'])
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(process.cwd(), 'data', 'uploads')

async function access(userId: string, role: string, classId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
  if (!cls) return null
  if (role === 'TEACHER' && cls.teacherId === userId) return { teacher: true }
  if (role === 'STUDENT' && await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: userId, classId } } })) return { teacher: false }
  return null
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
  if (!(await access(user.id, user.role, params.id))) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看课堂文件', statusCode: 403 } as ApiResponse, { status: 403 })
  const files = await prisma.classFile.findMany({ where: { classId: params.id }, select: { id: true, name: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ success: true, data: { files }, message: '文件列表获取成功', statusCode: 200 } as ApiResponse)
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
    const permission = await access(user.id, user.role, params.id)
    if (!permission?.teacher) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '只有本班教师可以上传文件', statusCode: 403 } as ApiResponse, { status: 403 })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024 || !ALLOWED_TYPES.has(file.type)) return NextResponse.json({ success: false, error: 'INVALID_FILE', message: '仅支持 20MB 内的 PDF、图片、TXT 或 Markdown', statusCode: 400 } as ApiResponse, { status: 400 })
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_').slice(0, 160)
    const fileId = crypto.randomUUID()
    const classDir = path.join(UPLOAD_ROOT, params.id)
    await mkdir(classDir, { recursive: true })
    const storagePath = path.join(classDir, `${fileId}-${safeName}`)
    await writeFile(storagePath, Buffer.from(await file.arrayBuffer()))
    const record = await prisma.classFile.create({ data: { id: fileId, classId: params.id, uploadedById: user.id, name: safeName, mimeType: file.type, size: file.size, storagePath }, select: { id: true, name: true, mimeType: true, size: true, createdAt: true } })
    return NextResponse.json({ success: true, data: { file: record }, message: '教材已上传', statusCode: 201 } as ApiResponse, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'UPLOAD_FAILED', message: '教材上传失败', statusCode: 500 } as ApiResponse, { status: 500 })
  }
}
