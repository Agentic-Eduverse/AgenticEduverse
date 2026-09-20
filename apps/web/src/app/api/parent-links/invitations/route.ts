import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-utils'
import { createParentInvitation, listParentInvitations } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

const createSchema = z.object({
  studentId: z.string().min(1).max(100),
  classId: z.string().min(1).max(100),
  parentEmail: z.string().email().max(320),
})

export async function GET(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    const classId = new URL(request.url).searchParams.get('classId') || ''
    if (!classId) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '缺少班级 ID', statusCode: 400 } as ApiResponse, { status: 400 })
    const invitations = await listParentInvitations(teacher.id, classId)
    return NextResponse.json({ success: true, data: { invitations }, message: '邀请列表获取成功', statusCode: 200 } as ApiResponse)
  } catch (error) {
    return parentLinkError(error, '获取邀请列表失败')
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    const validated = createSchema.safeParse(await request.json())
    if (!validated.success) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '邀请信息不完整', statusCode: 400 } as ApiResponse, { status: 400 })
    const invitation = await createParentInvitation(teacher.id, validated.data)
    return NextResponse.json({
      success: true,
      data: { ...invitation, path: `/parent/invite/${invitation.token}` },
      message: '家长邀请已创建，24 小时内有效',
      statusCode: 201,
    } as ApiResponse, { status: 201 })
  } catch (error) {
    return parentLinkError(error, '创建邀请失败')
  }
}

function parentLinkError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (message === '未登录') return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
  if (message.includes('权限不足') || message === 'STUDENT_NOT_IN_CLASS') return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '您无权为该学生创建邀请', statusCode: 403 } as ApiResponse, { status: 403 })
  console.error('[parent-links] invitation operation failed')
  return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: fallback, statusCode: 500 } as ApiResponse, { status: 500 })
}
