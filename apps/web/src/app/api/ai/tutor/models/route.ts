import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-utils'
import { getTutorModels } from '@/lib/tutor-models'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    await requireRole('STUDENT')
    return NextResponse.json({ success: true, data: await getTutorModels(), statusCode: 200 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === '未登录' ? 401 : message.startsWith('权限不足') ? 403 : 500
    return NextResponse.json({ success: false, message: '无法获取模型目录', statusCode: status }, { status })
  }
}
