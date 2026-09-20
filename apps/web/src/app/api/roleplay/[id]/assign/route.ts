import { NextResponse } from 'next/server'
import { prisma, Prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import { assignRoles } from '@eduverse/ai'
import type { ApiResponse, RolePlayAssignment, RolePlayRole } from '@eduverse/shared'
import type { StudentForAssignment } from '@eduverse/ai'
import { z } from 'zod'

const manualAssignmentSchema = z.object({ assignments: z.record(z.string().min(1), z.string().min(1)) })

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const scenarioId = params.id

    const scenario = await prisma.rolePlayScenario.findUnique({
      where: { id: scenarioId },
      include: {
        class: {
          include: {
            teacher: { select: { id: true } },
            enrollments: {
              include: {
                student: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    if (!scenario) {
      return NextResponse.json(
        { success: false, error: '场景不存在', message: '角色扮演场景不存在', statusCode: 404 } as ApiResponse,
        { status: 404 }
      )
    }

    if (scenario.class.teacher.id !== user.id) {
      return NextResponse.json(
        { success: false, error: '无权限', message: '您不是该班级的教师', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const roles = scenario.roles as unknown as RolePlayRole[]
    const enrolledStudents: StudentForAssignment[] = scenario.class.enrollments.map((e) => ({
      studentId: e.studentId,
      name: e.student.name,
    }))

    if (enrolledStudents.length === 0) {
      return NextResponse.json(
        { success: false, error: '无学生', message: '班级暂无已注册学生', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    if (enrolledStudents.length > roles.length) {
      return NextResponse.json(
        {
          success: false,
          error: '学生人数超过角色数',
          message: `当前班级有${enrolledStudents.length}名学生，但只有${roles.length}个可用角色`,
          statusCode: 400,
        } as ApiResponse,
        { status: 400 }
      )
    }

    const rawBody = await request.text()
    let manualAssignments: Record<string, string> | null = null
    if (rawBody.trim()) {
      let decoded: unknown
      try { decoded = JSON.parse(rawBody) } catch {
        return NextResponse.json({ success: false, error: 'INVALID_JSON', message: '角色分配数据不是合法 JSON', statusCode: 400 } as ApiResponse, { status: 400 })
      }
      const parsed = manualAssignmentSchema.safeParse(decoded)
      if (!parsed.success) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '角色分配格式不正确', statusCode: 400 } as ApiResponse, { status: 400 })
      const studentIds = new Set(enrolledStudents.map((student) => student.studentId))
      const roleKeys = new Set(roles.flatMap((role) => [role.id, role.name].filter((value): value is string => Boolean(value))))
      if (Object.keys(parsed.data.assignments).length !== enrolledStudents.length || Object.keys(parsed.data.assignments).some((studentId) => !studentIds.has(studentId)) || Object.values(parsed.data.assignments).some((role) => !roleKeys.has(role))) {
        return NextResponse.json({ success: false, error: 'INVALID_ASSIGNMENT', message: '必须为班级内每位学生分配有效角色', statusCode: 400 } as ApiResponse, { status: 400 })
      }
      manualAssignments = parsed.data.assignments
    }

    const scenarioData = {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      roles,
      subject: '',
      difficultyLevel: 'intermediate' as const,
    }

    const assignmentResult: RolePlayAssignment = manualAssignments
      ? { assignments: manualAssignments }
      : await assignRoles(scenarioData, enrolledStudents)

    const enrolledIds = new Set(enrolledStudents.map((student) => student.studentId))
    const studentIds = Object.keys(assignmentResult.assignments).filter((studentId) => enrolledIds.has(studentId))
    const shouldReward = !scenario.assignments
    await prisma.$transaction([
      prisma.rolePlayScenario.update({
        where: { id: scenarioId },
        data: { assignments: assignmentResult as unknown as Prisma.InputJsonValue },
      }),
      ...(shouldReward
        ? studentIds.flatMap((studentId) => [
            prisma.user.update({ where: { id: studentId }, data: { coins: { increment: 15 } } }),
            prisma.rewardLedger.create({ data: { userId: studentId, eventKey: `roleplay:${scenarioId}:${studentId}`, reason: 'ROLEPLAY_ASSIGNED', amount: 15 } }),
          ])
        : []),
    ])

    return NextResponse.json(
      {
        success: true,
        data: {
          assignments: assignmentResult,
          coinsEarnedPerStudent: shouldReward ? 15 : 0,
          rewardedStudentCount: shouldReward ? studentIds.length : 0,
        },
        message: shouldReward ? '角色分配成功！每位学生奖励 15 金币' : '角色重新分配成功',
        statusCode: 200,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '角色分配失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
