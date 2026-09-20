import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, Prisma } from '@eduverse/db'
import { requireRole } from '@/lib/auth-utils'
import type { ApiResponse, RolePlayAssignment, RolePlayRole, RolePlayScenario as RolePlayScenarioType } from '@eduverse/shared'

const rolePlayRoleSchema = z.object({
  name: z.string().min(1, '角色名不能为空').max(50, '角色名过长'),
  background: z.string().min(1, '角色背景不能为空').max(2000, '角色背景过长'),
  objective: z.string().min(1, '角色目标不能为空').max(1000, '角色目标过长'),
  secretObjective: z.string().max(1000).optional(),
})

const createRolePlaySchema = z.object({
  classId: z.string().min(1, '班级ID不能为空'),
  title: z.string().min(1, '场景标题不能为空').max(200, '场景标题过长'),
  description: z.string().min(1, '场景描述不能为空').max(5000, '场景描述过长'),
  roles: z.array(rolePlayRoleSchema).min(1, '至少需要一个角色'),
})

export async function GET() {
  try {
    const user = await requireRole(['TEACHER', 'STUDENT'])
    const scenarios = await prisma.rolePlayScenario.findMany({
      where: user.role === 'TEACHER'
        ? { class: { teacherId: user.id } }
        : { status: { in: ['ACTIVE', 'ENDED'] }, class: { enrollments: { some: { studentId: user.id } } } },
      select: { id: true, title: true, description: true, classId: true, roles: true, assignments: true, summary: true, status: true, startedAt: true, endedAt: true, createdAt: true, class: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ success: true, data: { scenarios: scenarios.map((scenario) => {
      const assignments = scenario.assignments as unknown as RolePlayAssignment | null
      if (user.role === 'TEACHER') return { ...scenario, assignments: assignments?.assignments || null, className: scenario.class.name }
      const ownRole = assignments?.assignments?.[user.id]
      const roles = (scenario.roles as unknown as RolePlayRole[]).map(({ secretObjective, ...role }) => ownRole && (role.id === ownRole || role.name === ownRole) ? { ...role, secretObjective } : role)
      return { ...scenario, roles, assignments: ownRole ? { [user.id]: ownRole } : null, className: scenario.class.name }
    }) }, message: '角色扮演列表获取成功', statusCode: 200 } as ApiResponse)
  } catch (error) {
    const status = error instanceof Error && error.message === '未登录' ? 401 : 500
    return NextResponse.json({ success: false, error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: status === 401 ? '请先登录' : '获取角色扮演列表失败', statusCode: status } as ApiResponse, { status })
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
    const validated = createRolePlaySchema.safeParse(body)
    if (!validated.success) {
      const errors = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return NextResponse.json(
        { success: false, error: errors, message: '参数验证失败', statusCode: 400 } as ApiResponse,
        { status: 400 }
      )
    }

    const { classId, title, description, roles } = validated.data

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

    const scenarioRoles: RolePlayRole[] = roles.map((r) => ({
      name: r.name,
      background: r.background,
      objective: r.objective,
      secretObjective: r.secretObjective,
    }))

    const scenario = await prisma.rolePlayScenario.create({
      data: {
        classId,
        title,
        description,
        roles: scenarioRoles as unknown as Prisma.InputJsonValue,
      },
    })

    const response: RolePlayScenarioType = {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      roles: scenarioRoles,
      subject: '',
      difficultyLevel: 'intermediate',
      classId: scenario.classId,
      createdAt: scenario.createdAt,
    } as unknown as RolePlayScenarioType

    return NextResponse.json(
      {
        success: true,
        data: { scenario: response },
        message: '角色扮演场景创建成功',
        statusCode: 201,
      } as ApiResponse<{ scenario: RolePlayScenarioType }>,
      { status: 201 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '创建角色扮演场景失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}
