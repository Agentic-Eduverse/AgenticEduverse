import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-utils'
import { revokeParentInvitation } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireRole('TEACHER')
    const revoked = await revokeParentInvitation(teacher.id, params.id)
    if (!revoked) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '邀请不存在或无权撤销', statusCode: 404 } as ApiResponse, { status: 404 })
    return NextResponse.json({ success: true, data: { id: params.id }, message: '邀请及对应绑定已撤销', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    const status = reason === '未登录' ? 401 : reason.includes('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : status === 403 ? '权限不足' : '撤销邀请失败', statusCode: status } as ApiResponse, { status })
  }
}
