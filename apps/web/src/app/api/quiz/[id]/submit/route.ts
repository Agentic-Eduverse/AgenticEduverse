import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, Prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { calculateQuizScore, type AnswerSubmission, type ApiResponse, type QuizQuestion } from '@eduverse/shared'

const submitAnswersSchema = z.object({
  answers: z.record(z.string().min(1), z.array(z.string().max(500)).max(20)).refine((value) => Object.keys(value).length <= 200, '答案数量过多'),
})

export async function POST(
  request: Request,
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

    const body = await request.json()
    const validated = submitAnswersSchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const quizId = params.id
    const { answers } = validated.data

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { class: true },
    })

    if (!quiz) {
      return NextResponse.json(
        { success: false, error: '测验不存在', message: '未找到指定测验', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    const deadline = quiz.startedAt ? quiz.startedAt.getTime() + quiz.timeLimitSeconds * 1000 : 0
    if (quiz.status !== 'ACTIVE' || !deadline) {
      return NextResponse.json({ success: false, error: 'QUIZ_NOT_ACTIVE', message: '测验未在进行中', statusCode: 409 } as ApiResponse, { status: 409 })
    }
    if (Date.now() > deadline + 5_000) {
      return NextResponse.json({ success: false, error: 'QUIZ_EXPIRED', message: '答题时间已结束', statusCode: 409 } as ApiResponse, { status: 409 })
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: user.id, classId: quiz.classId } },
    })

    if (!enrollment) {
      return NextResponse.json(
        { success: false, error: '无权限', message: '您未加入该班级，无法提交测验', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const existingSubmission = await prisma.submission.findUnique({
      where: { userId_quizId: { userId: user.id, quizId } },
    })

    if (existingSubmission) {
      return NextResponse.json(
        { success: false, error: '已提交', message: '您已提交过该测验', statusCode: 409 } as ApiResponse,
        { status: 409 }
      )
    }

    const questions = quiz.questions as unknown as QuizQuestion[]
    const submissions: AnswerSubmission[] = questions.flatMap((question) => {
      const answer = answers[question.id]
      if (!answer) return []
      return [{ questionId: question.id, ...(question.type === 'short_answer' ? { textAnswer: answer[0] || '' } : { selectedOptionIds: answer }) }]
    })
    const result = calculateQuizScore(submissions, questions)
    const score = result.percentage
    const isPerfect = result.totalPoints > 0 && result.rawScore === result.totalPoints

    const { submission, totalCoins } = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.submission.findUnique({
        where: { userId_quizId: { userId: user.id, quizId } },
        select: { id: true },
      })
      if (duplicate) throw new Error('ALREADY_SUBMITTED')
      const created = await tx.submission.create({
        data: {
          userId: user.id,
          quizId,
          answers: answers as unknown as Prisma.InputJsonValue,
          score,
          rawScore: result.rawScore,
          totalPoints: result.totalPoints,
          correctCount: result.correctCount,
        },
      })
      const rewardedUser = isPerfect
        ? await tx.user.update({ where: { id: user.id }, data: { coins: { increment: 10 } } })
        : user
      if (isPerfect) await tx.rewardLedger.create({ data: { userId: user.id, eventKey: `quiz-perfect:${user.id}:${quizId}`, reason: 'QUIZ_PERFECT', amount: 10 } })
      return { submission: created, totalCoins: rewardedUser.coins }
    }, { isolationLevel: 'Serializable' })
    const coinsEarned = isPerfect ? 10 : 0

    return NextResponse.json(
      {
        success: true,
        data: {
          submission,
          score,
          rawScore: result.rawScore,
          totalPoints: result.totalPoints,
          correctCount: result.correctCount,
          totalQuestions: result.totalQuestions,
          isPerfect,
          coinsEarned,
          totalCoins,
        },
        message: isPerfect
          ? '提交成功！满分奖励 10 金币'
          : `提交成功！得分：${score}分`,
        statusCode: 201,
      } as ApiResponse,
      { status: 201 }
    )
  } catch (e) {
    const error = e as Error
    if (error.message === 'ALREADY_SUBMITTED') {
      return NextResponse.json(
        { success: false, error: '已提交', message: '您已提交过该测验', statusCode: 409 } as ApiResponse,
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '提交测验失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
