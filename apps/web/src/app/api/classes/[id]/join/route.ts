import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import { requireRole } from '@/lib/auth-utils'
import { hashPassword, verifyPassword } from '@/lib/password'
import type { ApiResponse } from '@eduverse/shared'

const joinClassSchema = z.object({
  roomCode: z.string().trim().min(1, '房间码不能为空').max(10, '房间码过长').transform((value) => value.toUpperCase()),
  password: z.string().max(100, '加入密码过长').optional().nullable(),
})

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value)
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let user
    try {
      user = await requireRole('STUDENT')
    } catch (e) {
      const err = e as Error
      if (err.message === '未登录') {
        return NextResponse.json(
          { success: false, error: '未登录', message: '请先登录', statusCode: 401 } as ApiResponse,
          { status: 401 }
        )
      }
      return NextResponse.json(
        { success: false, error: '权限不足', message: err.message, statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const body = await _request.json()
    const validated = joinClassSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { roomCode, password } = validated.data
    const pathClassId = params.id

    const cls = await prisma.class.findUnique({ where: { roomCode } })
    if (!cls) {
      return NextResponse.json(
        { success: false, error: '班级不存在', message: '房间码无效，请检查后重试', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    if (cls.id !== pathClassId) {
      return NextResponse.json(
        { success: false, error: '房间码不匹配', message: '该房间码与班级ID不匹配', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    if (cls.password) {
      if (!password) {
        return NextResponse.json(
          { success: false, error: '需要密码', message: '该班级需要加入密码', statusCode: 400 } as ApiResponse,
          { status: 400 }
        )
      }
      const isLegacyPlaintext = !isBcryptHash(cls.password)
      const isValid = isLegacyPlaintext
        ? password === cls.password
        : await verifyPassword(password, cls.password)
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: '密码错误', message: '加入密码不正确', statusCode: 401 } as ApiResponse,
          { status: 401 }
        )
      }
    }

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: user.id, classId: cls.id } },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: '已加入', message: '您已经加入了该班级', statusCode: 409 } as ApiResponse,
        { status: 409 }
      )
    }

    const migratedPassword = cls.password && !isBcryptHash(cls.password)
      ? await hashPassword(cls.password)
      : null
    const { enrollment, updatedUser } = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.enrollment.findUnique({
        where: { studentId_classId: { studentId: user.id, classId: cls.id } },
        select: { id: true },
      })
      if (duplicate) throw new Error('ALREADY_JOINED')
      const createdEnrollment = await tx.enrollment.create({
        data: { studentId: user.id, classId: cls.id },
      })
      const rewardedUser = await tx.user.update({
        where: { id: user.id },
        data: { coins: { increment: 5 } },
      })
      await tx.rewardLedger.create({
        data: { userId: user.id, eventKey: `enroll:${user.id}:${cls.id}`, reason: 'ATTEND_CLASS', amount: 5 },
      })
      if (migratedPassword) {
        await tx.class.update({ where: { id: cls.id }, data: { password: migratedPassword } })
      }
      return { enrollment: createdEnrollment, updatedUser: rewardedUser }
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          enrollment,
          coinsEarned: 5,
          totalCoins: updatedUser.coins,
        },
        message: '加入班级成功，奖励 5 金币（ATTEND_CLASS）',
        statusCode: 201,
      } as ApiResponse<{
        enrollment: typeof enrollment
        coinsEarned: number
        totalCoins: number
      }>,
      { status: 201 }
    )
  } catch (e) {
    const error = e as Error
    if (error.message === 'ALREADY_JOINED') {
      return NextResponse.json(
        { success: false, error: '已加入', message: '您已经加入了该班级', statusCode: 409 } as ApiResponse,
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '加入班级失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
