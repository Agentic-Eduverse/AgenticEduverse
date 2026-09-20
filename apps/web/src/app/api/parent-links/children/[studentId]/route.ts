import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-utils'
import { unlinkChild } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

export async function DELETE(_request: Request, { params }: { params: { studentId: string } }) {
  try {
    const parent = await requireRole('PARENT')
    const removed = await unlinkChild(parent.id, params.studentId)
    if (!removed) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '未找到有效绑定', statusCode: 404 } as ApiResponse, { status: 404 })
    return NextResponse.json({ success: true, data: { studentId: params.studentId }, message: '绑定已解除', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    const status = reason === '未登录' ? 401 : reason.includes('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : status === 403 ? '权限不足' : '解除绑定失败', statusCode: status } as ApiResponse, { status })
  }
}
