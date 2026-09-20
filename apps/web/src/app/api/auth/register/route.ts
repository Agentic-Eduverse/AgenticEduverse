import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import type { ApiResponse, Role, UserSafe } from '@eduverse/shared'
import { hashPassword } from '@/lib/password'
import { takeRateLimit } from '@/lib/rate-limit'

const registerSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(100, '姓名过长'),
  email: z.string().trim().email('邮箱格式不正确').max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(6, '密码至少需要 6 位字符').max(128, '密码不能超过 128 位字符'),
  role: z.enum(['TEACHER', 'STUDENT', 'PARENT'] as const),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const validated = registerSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        {
          success: false,
          error: errors,
          message: '参数验证失败',
          statusCode: 400,
        } as ApiResponse,
        { status: 400 }
      )
    }

    const { name, email, password, role } = validated.data
    if (!takeRateLimit(`register:${email}`, 5, 60 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', message: '注册尝试过多，请稍后再试', statusCode: 429 } as ApiResponse,
        { status: 429 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: '邮箱已被注册',
          message: '该邮箱已存在，请使用其他邮箱',
          statusCode: 409,
        } as ApiResponse,
        { status: 409 }
      )
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role as Role,
      },
    })

    const userSafe: UserSafe = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as UserSafe['role'],
      avatarConfig: user.avatarConfig ?? undefined,
      coins: user.coins,
      createdAt: user.createdAt,
    }

    return NextResponse.json(
      {
        success: true,
        data: { user: userSafe },
        message: '注册成功',
        statusCode: 201,
      } as ApiResponse<{ user: UserSafe }>,
      { status: 201 }
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'EMAIL_EXISTS', message: '该邮箱已存在，请使用其他邮箱', statusCode: 409 } as ApiResponse,
        { status: 409 }
      )
    }
    console.error('[register] unable to create user')
    return NextResponse.json(
      {
        success: false,
        error: '服务器内部错误',
        message: '注册失败，请稍后重试',
        statusCode: 500,
      } as ApiResponse,
      { status: 500 }
    )
  }
}
