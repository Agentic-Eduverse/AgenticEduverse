import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-utils'
import { redeemParentInvitation } from '@/lib/parent-links'
import type { ApiResponse } from '@eduverse/shared'

const schema = z.object({ token: z.string().min(20).max(500) })

export async function POST(request: Request) {
  try {
    const parent = await requireRole('PARENT')
    const validated = schema.safeParse(await request.json())
    if (!validated.success) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '邀请链接无效', statusCode: 400 } as ApiResponse, { status: 400 })
    const child = await redeemParentInvitation(parent, validated.data.token)
    return NextResponse.json({ success: true, data: { child }, message: '孩子账号绑定成功', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const responses: Record<string, [number, string]> = {
      INVALID_INVITATION: [404, '邀请不存在'],
      INVITATION_EMAIL_MISMATCH: [403, '当前登录邮箱与邀请指定邮箱不一致'],
      INVITATION_REVOKED: [410, '邀请已撤销'],
      INVITATION_USED: [409, '邀请已被使用'],
      INVITATION_EXPIRED: [410, '邀请已过期'],
      '未登录': [401, '请先登录'],
    }
    const response: [number, string] = code.includes('权限不足')
      ? [403, '只有家长账号可以兑换邀请']
      : responses[code] || [500, '绑定失败，请稍后重试']
    const [status, message] = response
    if (status === 500) console.error('[parent-links] invitation redemption failed')
    return NextResponse.json({ success: false, error: code || 'INTERNAL_ERROR', message, statusCode: status } as ApiResponse, { status })
  }
}
