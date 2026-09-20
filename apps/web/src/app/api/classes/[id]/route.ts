import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import type { ApiResponse, ClassResponse } from '@eduverse/shared'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
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

    const classId = params.id

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
        enrollments: {
          select: { student: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        sessions: {
          take: 5,
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            _count: { select: { messages: true, emotions: true } },
          },
        },
      },
    })

    if (!cls) {
      return NextResponse.json(
        { success: false, error: '班级不存在', message: '该班级不存在', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    const isTeacher = cls.teacherId === user.id
    const isEnrolled = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: user.id, classId } },
    })

    if (!isTeacher && !isEnrolled) {
      return NextResponse.json(
        { success: false, error: '无权限访问', message: '您不是该班级的教师或已注册学生', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const classResponse = {
      id: cls.id,
      name: cls.name,
      teacherId: cls.teacherId,
      teacherName: cls.teacher?.name,
      teacherEmail: cls.teacher?.email,
      roomCode: cls.roomCode,
      scheduledAt: cls.scheduledAt ?? undefined,
      duration: cls.duration,
      isLive: cls.isLive,
      createdAt: cls.createdAt,
      enrollmentsCount: cls._count.enrollments,
      recentSessions: cls.sessions,
      students: isTeacher
        ? cls.enrollments.map((enrollment) => ({ id: enrollment.student.id, name: enrollment.student.name }))
        : undefined,
    } as unknown as ClassResponse

    return NextResponse.json(
      {
        success: true,
        data: { class: classResponse },
        message: '获取班级详情成功',
        statusCode: 200,
      } as ApiResponse<{ class: ClassResponse }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取班级详情失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
