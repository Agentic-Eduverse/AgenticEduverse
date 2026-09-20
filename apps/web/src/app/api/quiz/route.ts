import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, Prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse, QuizQuestion, QuizResponse } from '@eduverse/shared'

const optionSchema = z.object({ id: z.string().min(1), text: z.string().trim().min(1).max(500) })
const questionSchema = z.object({
  id: z.string().min(1),
  questionText: z.string().trim().min(1, '题目内容不能为空').max(5000),
  options: z.array(optionSchema).max(10).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
  type: z.enum(['single_choice', 'multiple_choice', 'true_false', 'short_answer']),
  points: z.number().int().min(1).max(100).default(1),
  explanation: z.string().trim().max(5000).optional(),
}).superRefine((question, context) => {
  if (question.type !== 'short_answer' && (!question.options || question.options.length < 2)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '客观题至少需要两个选项', path: ['options'] })
  }
  const optionIds = new Set(question.options?.map((option) => option.id) || [])
  const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]
  if (question.type !== 'short_answer' && answers.some((answer) => !optionIds.has(answer))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '正确答案必须对应现有选项', path: ['correctAnswer'] })
  }
  if (question.type === 'multiple_choice' && answers.length < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '多选题至少需要一个正确答案', path: ['correctAnswer'] })
  }
})

const quizSchema = z.object({
  classId: z.string().min(1),
  title: z.string().trim().min(1, '测验标题不能为空').max(200),
  questions: z.array(questionSchema).min(1, '至少需要一道题目').max(100),
  timeLimitSeconds: z.number().int().min(15).max(7200).default(300),
  source: z.enum(['MANUAL', 'AI']).default('MANUAL'),
})

export async function GET(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    const classId = new URL(request.url).searchParams.get('classId') || ''
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!cls || cls.teacherId !== teacher.id) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权查看该班级测验', statusCode: 403 } as ApiResponse, { status: 403 })
    }
    const quizzes = await prisma.quiz.findMany({
      where: { classId },
      select: { id: true, title: true, questions: true, status: true, source: true, timeLimitSeconds: true, createdAt: true, startedAt: true, endedAt: true, _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({
      success: true,
      data: { quizzes: quizzes.map((quiz) => ({ ...quiz, submissionCount: quiz._count.submissions, _count: undefined })) },
      message: '测验列表获取成功',
      statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const status = error instanceof Error && error.message === '未登录' ? 401 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : '获取测验失败', statusCode: status } as ApiResponse, { status })
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await requireRole('TEACHER')
    const validated = quizSchema.safeParse(await request.json())
    if (!validated.success) {
      const issue = validated.error.issues[0]
      const detail = issue ? `${issue.path.join('.') || 'quiz'}: ${issue.message}` : '测验格式不正确'
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: detail, statusCode: 400 } as ApiResponse, { status: 400 })
    }
    const { classId, title, questions, timeLimitSeconds, source } = validated.data
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!cls || cls.teacherId !== teacher.id) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权在该班级创建测验', statusCode: 403 } as ApiResponse, { status: 403 })
    }
    const transformed: QuizQuestion[] = questions.map(({ questionText, ...question }) => ({ ...question, text: questionText }))
    const quiz = await prisma.quiz.create({
      data: {
        classId,
        title,
        questions: transformed as unknown as Prisma.InputJsonValue,
        createdBy: teacher.id,
        status: 'DRAFT',
        source,
        timeLimitSeconds,
      },
    })
    const response: QuizResponse = {
      id: quiz.id,
      classId: quiz.classId,
      title: quiz.title,
      questions: transformed,
      createdBy: quiz.createdBy,
      createdAt: quiz.createdAt,
      timeLimitSeconds: quiz.timeLimitSeconds,
    }
    return NextResponse.json({ success: true, data: { quiz: response }, message: '测验草稿已保存', statusCode: 201 } as ApiResponse<{ quiz: QuizResponse }>, { status: 201 })
  } catch (error) {
    const status = error instanceof Error && error.message === '未登录' ? 401 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : '创建测验失败', statusCode: status } as ApiResponse, { status })
  }
}
