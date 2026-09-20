import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

const publishSchema = z.object({
  script: z.string().min(1).max(50_000),
  keyPoints: z.array(z.string().min(1).max(1_000)).max(50),
  difficulties: z.array(z.string().min(1).max(1_000)).max(50),
  previewQuestions: z.array(z.string().min(1).max(2_000)).max(50),
})

export async function PUT(
  request: Request,
  { params }: { params: { materialId: string } }
) {
  try {
    const user = await requireRole('TEACHER')
    const validated = publishSchema.safeParse(await request.json())
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: '预习内容格式不正确', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const material = await prisma.material.findUnique({
      where: { id: params.materialId },
      include: { class: { select: { teacherId: true } } },
    })
    if (!material || material.type !== 'preview') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: '预习内容不存在', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }
    if (material.class.teacherId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: '您无权发布该预习内容', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const publication = await prisma.$transaction(async (tx) => {
      const current = await tx.material.findUnique({ where: { id: material.id }, select: { metadata: true } })
      const existingMetadata = current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {}
      const shouldReward = !existingMetadata.publishedAt
      await tx.material.update({
        where: { id: material.id },
        data: {
          content: JSON.stringify(validated.data),
          metadata: { ...existingMetadata, publishedAt: new Date().toISOString(), publishedBy: user.id },
        },
      })
      const rewardedUser = shouldReward
        ? await tx.user.update({ where: { id: user.id }, data: { coins: { increment: 10 } } })
        : user
      if (shouldReward) await tx.rewardLedger.create({ data: { userId: user.id, eventKey: `preview-publish:${user.id}:${material.id}`, reason: 'PREVIEW_PUBLISHED', amount: 10 } })
      return { shouldReward, totalCoins: rewardedUser.coins }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({
      success: true,
      data: { materialId: material.id, coinsEarned: publication.shouldReward ? 10 : 0, totalCoins: publication.totalCoins },
      message: '预习已发布',
      statusCode: 200,
    } as ApiResponse<{ materialId: string; coinsEarned: number; totalCoins: number }>)
  } catch (error) {
    const message = error instanceof Error && error.message === '未登录' ? '请先登录' : '发布预习失败'
    const status = message === '请先登录' ? 401 : 500
    return NextResponse.json(
      { success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message, statusCode: status } as ApiResponse,
      { status }
    )
  }
}
