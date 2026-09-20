import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import type { ApiResponse } from '@eduverse/shared'

const lookupSchema = z.object({
  roomCode: z.string().trim().min(1, '房间码不能为空').max(10, '房间码过长').transform((value) => value.toUpperCase()),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const roomCode = searchParams.get('roomCode')

    const validated = lookupSchema.safeParse({ roomCode })
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const cls = await prisma.class.findUnique({
      where: { roomCode: validated.data.roomCode },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    })

    if (!cls) {
      return NextResponse.json(
        { success: false, error: '班级不存在', message: '未找到该房间码对应的班级', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          class: {
            id: cls.id,
            name: cls.name,
            teacherId: cls.teacherId,
            teacherName: cls.teacher?.name,
            roomCode: cls.roomCode,
            scheduledAt: cls.scheduledAt ?? undefined,
            duration: cls.duration,
            isLive: cls.isLive,
            hasPassword: !!cls.password,
            enrollmentsCount: cls._count.enrollments,
            createdAt: cls.createdAt,
          },
        },
        message: '查找班级成功',
        statusCode: 200,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '查找班级失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
