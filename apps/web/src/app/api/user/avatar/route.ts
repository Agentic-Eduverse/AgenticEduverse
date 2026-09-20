import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, Prisma } from '@eduverse/db'
import { auth } from '@/auth'
import type { ApiResponse } from '@eduverse/shared'

const avatarConfigSchema = z.object({
  type: z.enum(['animal', 'cartoon', 'robot', 'custom']).optional(),
  seed: z.string().max(100).optional(),
  colors: z.object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    background: z.string().max(20).optional(),
  }).optional(),
  accessories: z.array(z.string().max(50)).max(10).optional(),
  customImageUrl: z.string().max(1_000_000).refine(
    (value) => /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) || /^https:\/\//.test(value),
    '头像图片格式不支持'
  ).optional(),
}).strict()

const updateAvatarSchema = z.object({
  avatarConfig: avatarConfigSchema,
})

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: '未登录', message: '请先登录', statusCode: 401 } as ApiResponse,
        { status: 401 }
      )
    }
    if (session.user.role !== 'STUDENT') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: '只有学生可以设置课堂头像', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const body = await request.json()
    const validated = updateAvatarSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { avatarConfig } = validated.data

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: session.user!.email! },
        select: { avatarConfig: true },
      })
      if (!existing) throw new Error('USER_NOT_FOUND')
      const isNewAvatar = !existing.avatarConfig
      const updatedUser = await tx.user.update({
        where: { email: session.user!.email! },
        data: {
          avatarConfig: avatarConfig as unknown as Prisma.InputJsonValue,
          coins: isNewAvatar ? { increment: 3 } : undefined,
        },
      })
      if (isNewAvatar) {
        await tx.rewardLedger.create({ data: { userId: session.user!.id, eventKey: `avatar:${session.user!.id}`, reason: 'AVATAR_CREATED', amount: 3 } })
      }
      return { updatedUser, coinsEarned: isNewAvatar ? 3 : 0 }
    }, { isolationLevel: 'Serializable' })
    const { updatedUser, coinsEarned } = result

    return NextResponse.json(
      {
        success: true,
        data: {
          avatarConfig: updatedUser.avatarConfig,
          coinsEarned,
          totalCoins: updatedUser.coins,
        },
        message: coinsEarned > 0
          ? '头像设置成功，奖励 3 金币'
          : '头像更新成功',
        statusCode: 200,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '更新头像失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
