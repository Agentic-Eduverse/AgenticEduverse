import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@eduverse/db'
import { AIConfigurationError, generateQuizDraft } from '@eduverse/ai'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse } from '@eduverse/shared'

const schema = z.object({
  classId: z.string().min(1),
  material: z.string().trim().min(20).max(50_000),
  count: z.number().int().min(1).max(20).default(5),
  difficulty: z.string().max(50).optional(),
})

export async function POST(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    const validated = schema.safeParse(await request.json())
    if (!validated.success) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: validated.error.issues[0]?.message || '参数错误', statusCode: 400 } as ApiResponse, { status: 400 })
    const cls = await prisma.class.findUnique({ where: { id: validated.data.classId }, select: { teacherId: true } })
    if (!cls || cls.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权在该班级出题', statusCode: 403 } as ApiResponse, { status: 403 })
    const draft = await generateQuizDraft(validated.data)
    return NextResponse.json({ success: true, data: { draft }, message: 'AI 草稿已生成，请审阅后保存', statusCode: 200 } as ApiResponse)
  } catch (error) {
    if (error instanceof AIConfigurationError || (error instanceof Error && error.message === 'AI_NOT_CONFIGURED')) {
      return NextResponse.json({ success: false, error: 'AI_NOT_CONFIGURED', message: 'AI 尚未配置，请先设置模型服务', statusCode: 503 } as ApiResponse, { status: 503 })
    }
    const status = error instanceof Error && error.message === '未登录' ? 401 : 502
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'AI_UPSTREAM_ERROR', message: status === 401 ? '请先登录' : 'AI 出题失败，请检查模型服务', statusCode: status } as ApiResponse, { status })
  }
}
