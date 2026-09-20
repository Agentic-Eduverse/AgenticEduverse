import { NextResponse } from 'next/server'
import { prisma } from '@eduverse/db'
import { auth } from '@/auth'
import { z } from 'zod'
import type { ApiResponse, RolePlayScenario as RolePlayScenarioType, RolePlayRole, RolePlayAssignment } from '@eduverse/shared'

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

    const scenarioId = params.id

    const scenario = await prisma.rolePlayScenario.findUnique({
      where: { id: scenarioId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, userId: true, roleName: true, content: true, createdAt: true } },
        class: {
          include: {
            enrollments: {
              include: {
                student: { select: { id: true, name: true, avatarConfig: true } },
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

    const isTeacher = scenario.class.teacherId === user.id
    const isEnrolled = scenario.class.enrollments.some((e) => e.studentId === user.id)

    if (!isTeacher && !isEnrolled) {
      return NextResponse.json(
        { success: false, error: '无权限访问', message: '您无权查看该场景', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }
    if (!isTeacher && scenario.status === 'DRAFT') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: '活动尚未发布', statusCode: 403 } as ApiResponse,
        { status: 403 }
      )
    }

    const assignments = scenario.assignments as unknown as RolePlayAssignment | null
    const ownRole = assignments?.assignments?.[user.id]
    const visibleRoles = isTeacher
      ? scenario.roles as unknown as RolePlayRole[]
      : (scenario.roles as unknown as RolePlayRole[]).map(({ secretObjective, ...role }) =>
          ownRole && (role.id === ownRole || role.name === ownRole) ? { ...role, secretObjective } : role
        )

    const enrolledStudents = scenario.class.enrollments.map((e) => ({
      userId: e.studentId,
      name: e.student.name,
      avatarConfig: e.student.avatarConfig,
    }))

    const response = {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      roles: visibleRoles,
      assignments: isTeacher ? assignments?.assignments || null : ownRole ? { [user.id]: ownRole } : null,
      classId: scenario.classId,
      className: scenario.class.name,
      enrolledStudents: isTeacher ? enrolledStudents : undefined,
      status: scenario.status,
      startedAt: scenario.startedAt,
      endedAt: scenario.endedAt,
      createdAt: scenario.createdAt,
      summary: scenario.summary,
      messages: scenario.messages,
    }

    return NextResponse.json(
      {
        success: true,
        data: { scenario: response },
        message: '获取场景详情成功',
        statusCode: 200,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (e) {
    const error = e as Error
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取场景详情失败', statusCode: 500 } as ApiResponse,
      { status: 500 }
    )
  }
}

const roleSchema = z.object({
  id: z.string().optional(), name: z.string().min(1).max(50), background: z.string().min(1).max(2000),
  objective: z.string().min(1).max(1000), secretObjective: z.string().max(1000).optional(),
})
const statusSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['start', 'end']) }),
  z.object({ action: z.literal('update'), title: z.string().min(1).max(200), description: z.string().min(1).max(5000), roles: z.array(roleSchema).min(1).max(100) }),
])

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 } as ApiResponse, { status: 401 })
    const teacher = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true } })
    if (!teacher || teacher.role !== 'TEACHER') return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '仅教师可控制活动', statusCode: 403 } as ApiResponse, { status: 403 })
    const parsed = statusSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: '活动操作无效', statusCode: 400 } as ApiResponse, { status: 400 })
    const scenario = await prisma.rolePlayScenario.findUnique({ where: { id: params.id }, include: { class: { select: { teacherId: true } } } })
    if (!scenario) return NextResponse.json({ success: false, error: 'NOT_FOUND', message: '场景不存在', statusCode: 404 } as ApiResponse, { status: 404 })
    if (scenario.class.teacherId !== teacher.id) return NextResponse.json({ success: false, error: 'FORBIDDEN', message: '无权控制该场景', statusCode: 403 } as ApiResponse, { status: 403 })
    if (parsed.data.action === 'update') {
      if (scenario.status !== 'DRAFT') return NextResponse.json({ success: false, error: 'INVALID_STATE', message: '只有草稿场景可以编辑', statusCode: 409 } as ApiResponse, { status: 409 })
      const updated = await prisma.rolePlayScenario.update({ where: { id: scenario.id }, data: { title: parsed.data.title.trim(), description: parsed.data.description.trim(), roles: parsed.data.roles } })
      return NextResponse.json({ success: true, data: { scenario: updated }, message: '场景草稿已更新', statusCode: 200 } as ApiResponse)
    }
    if (parsed.data.action === 'start' && scenario.status !== 'DRAFT') return NextResponse.json({ success: false, error: 'INVALID_STATE', message: '只有草稿场景可以开始', statusCode: 409 } as ApiResponse, { status: 409 })
    if (parsed.data.action === 'start') {
      const enrollmentCount = await prisma.enrollment.count({ where: { classId: scenario.classId } })
      const assignments = scenario.assignments as unknown as RolePlayAssignment | null
      if (enrollmentCount > 0 && Object.keys(assignments?.assignments || {}).length < enrollmentCount) {
        return NextResponse.json({ success: false, error: 'ASSIGNMENTS_REQUIRED', message: '请先为所有学生分配角色', statusCode: 409 } as ApiResponse, { status: 409 })
      }
    }
    if (parsed.data.action === 'end' && scenario.status !== 'ACTIVE') return NextResponse.json({ success: false, error: 'INVALID_STATE', message: '只有进行中的场景可以结束', statusCode: 409 } as ApiResponse, { status: 409 })
    const now = new Date()
    const updated = await prisma.rolePlayScenario.update({
      where: { id: scenario.id },
      data: parsed.data.action === 'start'
        ? { status: 'ACTIVE', startedAt: now, endedAt: null }
        : { status: 'ENDED', endedAt: now },
    })
    return NextResponse.json({ success: true, data: { scenario: updated }, message: parsed.data.action === 'start' ? '活动已开始' : '活动已结束', statusCode: 200 } as ApiResponse)
  } catch {
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: '更新活动状态失败', statusCode: 500 } as ApiResponse, { status: 500 })
  }
}
