import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import type { ApiResponse, UserSafe } from '@eduverse/shared'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: '未登录', message: '请先登录', statusCode: 401 } as ApiResponse,
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在', message: '用户不存在', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    const userSafe: UserSafe & { enrollmentsCount: number } = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as UserSafe['role'],
      avatarConfig: user.avatarConfig ?? undefined,
      coins: user.coins,
      createdAt: user.createdAt,
      enrollmentsCount: user._count.enrollments,
    }

    return NextResponse.json(
      {
        success: true,
        data: { user: userSafe },
        message: '获取用户信息成功',
        statusCode: 200,
      } as ApiResponse<{ user: UserSafe & { enrollmentsCount: number } }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取用户信息失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
