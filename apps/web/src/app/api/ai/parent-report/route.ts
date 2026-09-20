import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { AIConfigurationError, generateParentReport } from '@eduverse/ai'
import { isLinkedParent } from '@/lib/parent-links'
import type { ApiResponse, ParentReportResponse } from '@eduverse/shared'
import { takeRateLimit } from '@/lib/rate-limit'
import { withTimeout } from '@/lib/async-utils'

const parentReportSchema = z.object({
  studentId: z.string().min(1, '学生ID不能为空'),
  weekStart: z.string().min(1, '开始日期不能为空'),
  weekEnd: z.string().min(1, '结束日期不能为空'),
})

export async function POST(request: Request) {
  try {
    let user
    try {
      user = await requireRole('PARENT')
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
    if (!takeRateLimit(`ai-parent-report:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED', message: '报告生成过于频繁，请稍后再试', statusCode: 429 } as ApiResponse, { status: 429 })
    }
    const validated = parentReportSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { studentId, weekStart, weekEnd } = validated.data

    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(weekEnd)

    if (isNaN(weekStartDate.getTime()) || isNaN(weekEndDate.getTime())) {
      return NextResponse.json(
        { success: false, error: '日期格式无效', message: '请提供有效的日期', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    if (weekStartDate >= weekEndDate) {
      return NextResponse.json(
        { success: false, error: '日期范围无效', message: '开始日期必须早于结束日期', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }
    if (weekEndDate.getTime() - weekStartDate.getTime() > 8 * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { success: false, error: '日期范围无效', message: '报告时间范围不能超过 8 天', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, role: true },
    })

    if (!student) {
      return NextResponse.json(
        { success: false, error: '学生不存在', message: '未找到指定学生', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    if (student.role !== 'STUDENT') {
      return NextResponse.json(
        { success: false, error: '用户不是学生', message: '指定用户不是学生角色', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    if (!(await isLinkedParent(user.id, studentId))) {
      return NextResponse.json(
        { success: false, error: '无权限查看该学生', message: '您与该学生无关联关系', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const result: ParentReportResponse = await withTimeout(generateParentReport(
      studentId,
      weekStartDate,
      weekEndDate,
      student.name
    ), 55_000)

    return NextResponse.json(
      {
        success: true,
        data: {
          report: result,
          student: { id: studentId, name: student.name },
          weekStart: weekStartDate,
          weekEnd: weekEndDate,
        },
        message: '家长报告生成成功',
        statusCode: 200,
      } as ApiResponse<{
        report: ParentReportResponse
        student: { id: string; name: string }
        weekStart: Date
        weekEnd: Date
      }>,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    if (error instanceof AIConfigurationError || error.message === 'AI_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: 'AI_NOT_CONFIGURED', message: 'AI 尚未配置，请先设置模型服务', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '生成家长报告失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
