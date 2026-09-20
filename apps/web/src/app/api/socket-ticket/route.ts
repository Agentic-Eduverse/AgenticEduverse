import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import { createSocketTicket } from '@/lib/socket-ticket'
import type { ApiResponse } from '@eduverse/shared'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse,
        { status: 401 }
      )
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: '用户不存在', statusCode: 401 } as ApiResponse,
        { status: 401 }
      )
    }
    return NextResponse.json({
      success: true,
      data: createSocketTicket(user.id),
      message: '连接票据已签发',
      statusCode: 200,
    } as ApiResponse<{ token: string; expiresAt: string }>)
  } catch (error) {
    console.error('[socket-ticket] unable to issue ticket')
    return NextResponse.json(
      { success: false, error: 'TICKET_UNAVAILABLE', message: '实时课堂暂时不可用', statusCode: 503 } as ApiResponse,
      { status: 503 }
    )
  }
}
