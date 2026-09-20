import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import { requireRole } from '@/lib/auth-utils'
import { generateRoomCode } from '@/lib/utils'
import { hashPassword } from '@/lib/password'
import type { ApiResponse, ClassResponse } from '@eduverse/shared'

const createClassSchema = z.object({
  name: z.string().min(1, '班级名称不能为空').max(100, '班级名称不能超过100个字符'),
  scheduledAt: z.string().optional().nullable(),
  duration: z.number().int().min(1, '课程时长必须大于0').max(480, '课程时长不能超过480分钟'),
  password: z.string().max(100, '加入密码过长').optional().nullable().transform((v) => (v === null || v === undefined || v === '' ? undefined : v)),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: '未登录', message: '请先登录', statusCode: 401 } as ApiResponse,
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在', message: '用户不存在', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    let classes: unknown[] = []

    if (user.role === 'TEACHER') {
      classes = await prisma.class.findMany({
        where: { teacherId: user.id },
        include: {
          teacher: { select: { id: true, name: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    } else if (user.role === 'STUDENT') {
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: {
          class: {
            include: {
              teacher: { select: { id: true, name: true } },
              _count: { select: { enrollments: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      })
      classes = enrollments.map((e) => e.class)
    } else {
      return NextResponse.json(
        { success: false, error: '角色不支持', message: '家长无法查看班级列表', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const classResponses: ClassResponse[] = (classes as Array<{
      id: string
      name: string
      teacherId: string
      teacher?: { id: string; name: string }
      roomCode: string
      scheduledAt: Date | null
      duration: number
      isLive: boolean
      createdAt: Date
      _count?: { enrollments: number }
    }>).map((c) => ({
      id: c.id,
      name: c.name,
      teacherId: c.teacherId,
      teacherName: c.teacher?.name,
      roomCode: c.roomCode,
      scheduledAt: c.scheduledAt ?? undefined,
      duration: c.duration,
      isLive: c.isLive,
      createdAt: c.createdAt,
      enrollmentsCount: c._count?.enrollments ?? 0,
    } as unknown as ClassResponse))

    return NextResponse.json(
      {
        success: true,
        data: { classes: classResponses },
        message: '获取班级列表成功',
        statusCode: 200,
      } as ApiResponse<{ classes: ClassResponse[] }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取班级列表失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    let user
    try {
      user = await requireRole('TEACHER')
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

    const body = await request.json()
    const validated = createClassSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { name, scheduledAt, duration, password } = validated.data

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
    if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { success: false, error: '日期格式无效', message: '请选择有效的上课时间', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const passwordHash = password ? await hashPassword(password) : null

    let roomCode: string
    let attempts = 0
    do {
      roomCode = generateRoomCode(6)
      const existing = await prisma.class.findUnique({ where: { roomCode } })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return NextResponse.json(
        { success: false, error: '生成房间码失败', message: '请稍后重试', statusCode: 500 } as ApiResponse,
        { status: 500 }
      )
    }

    const cls = await prisma.class.create({
      data: {
        name,
        teacherId: user.id,
        roomCode,
        scheduledAt: scheduledDate,
        duration,
        password: passwordHash,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    })

    const classResponse: ClassResponse = {
      id: cls.id,
      name: cls.name,
      teacherId: cls.teacherId,
      teacherName: cls.teacher?.name,
      roomCode: cls.roomCode,
      scheduledAt: cls.scheduledAt ?? undefined,
      duration: cls.duration,
      isLive: cls.isLive,
      createdAt: cls.createdAt,
      enrollmentsCount: cls._count.enrollments,
    } as unknown as ClassResponse

    return NextResponse.json(
      {
        success: true,
        data: { class: classResponse },
        message: '班级创建成功',
        statusCode: 201,
      } as ApiResponse<{ class: ClassResponse }>,
      { status: 201 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '创建班级失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
