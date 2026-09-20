import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-utils'
import { listLinkedChildren } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

export async function GET() {
  try {
    const parent = await requireRole('PARENT')
    const children = await listLinkedChildren(parent.id)
    return NextResponse.json({ success: true, data: { children }, message: '孩子列表获取成功', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    const status = reason === '未登录' ? 401 : reason.includes('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : status === 403 ? '权限不足' : '获取孩子列表失败', statusCode: status } as ApiResponse, { status })
  }
}
