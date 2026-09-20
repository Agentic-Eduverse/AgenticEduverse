import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { AIConfigurationError, generatePreClassPreview } from '@eduverse/ai'
import type { ApiResponse, PreviewResponse, GeneratePreClassPreviewParams } from '@eduverse/shared'
import { takeRateLimit } from '@/lib/rate-limit'
import { withTimeout } from '@/lib/async-utils'

const previewSchema = z.object({
  classId: z.string().min(1, '班级ID不能为空'),
  material: z.string().min(20, '教材内容过短，至少需要20个字符').max(50000, '教材内容过长'),
  teachingStyle: z.string().max(200).optional(),
  teacherSample: z.string().max(5000).optional(),
  subject: z.string().min(1, '学科不能为空').max(50).default('综合'),
  topic: z.string().min(1, '主题不能为空').max(100).default('课程主题'),
  gradeLevel: z.string().min(1, '年级不能为空').max(50).default('通用'),
  durationMinutes: z.number().int().min(5).max(180).optional(),
})

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
    if (!takeRateLimit(`ai-preview:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED', message: '生成请求过于频繁，请稍后再试', statusCode: 429 } as ApiResponse, { status: 429 })
    }
    const validated = previewSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { classId, material, teachingStyle, subject, topic, gradeLevel, durationMinutes } = validated.data

    const cls = await prisma.class.findUnique({ where: { id: classId } })
    if (!cls) {
      return NextResponse.json(
        { success: false, error: '班级不存在', message: '未找到指定班级', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    if (cls.teacherId !== user.id) {
      return NextResponse.json(
        { success: false, error: '无权限', message: '您不是该班级的教师', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const aiParams: GeneratePreClassPreviewParams = {
      classId,
      subject,
      topic,
      materials: material,
      teachingStyle,
      gradeLevel,
      durationMinutes,
    }

    const result: PreviewResponse = await withTimeout(generatePreClassPreview(aiParams), 55_000)

    const materialRecord = await prisma.material.create({
      data: {
        classId,
        type: 'preview',
        title: `预习-${cls.name}`,
        content: JSON.stringify(result),
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          preview: result,
          materialId: materialRecord.id,
        },
        message: '课前预习生成成功',
        statusCode: 201,
      } as ApiResponse<{ preview: PreviewResponse; materialId: string }>,
      { status: 201 }
    )
  } catch (e) {
    const error = e as Error
    if (error instanceof AIConfigurationError || error.message === 'AI_NOT_CONFIGURED') {
      return NextResponse.json({ success: false, error: 'AI_NOT_CONFIGURED', message: 'AI 尚未配置，请先设置模型服务', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '生成课前预习失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
