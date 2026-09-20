import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import type { ApiResponse, PreviewResponse } from '@eduverse/shared'

export async function GET(
  _request: Request,
  { params }: { params: { classId: string } }
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

    const classId = params.classId

    const cls = await prisma.class.findUnique({ where: { id: classId } })
    if (!cls) {
      return NextResponse.json(
        { success: false, error: '班级不存在', message: '未找到指定班级', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    const isTeacher = cls.teacherId === user.id
    const isEnrolled = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: user.id, classId } },
    })

    if (!isTeacher && !isEnrolled) {
      return NextResponse.json(
        { success: false, error: '无权限', message: '您无权查看该班级的预习内容', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const candidates = await prisma.material.findMany({
      where: {
        classId,
        type: 'preview',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const material = candidates.find((candidate) => {
      if (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) return false
      return typeof (candidate.metadata as Record<string, unknown>).publishedAt === 'string'
    })

    if (!material) {
      return NextResponse.json(
        { success: false, error: '暂无已发布预习', message: '该班级尚无教师确认发布的预习内容', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    let preview: PreviewResponse
    try {
      preview = JSON.parse(material.content) as PreviewResponse
    } catch {
      return NextResponse.json(
        { success: false, error: '预习内容解析失败', message: '预习数据格式错误', statusCode: 500 } as ApiResponse,
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          preview,
          materialId: material.id,
          title: material.title,
          createdAt: material.createdAt,
        },
        message: '获取预习内容成功',
        statusCode: 200,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取预习内容失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
