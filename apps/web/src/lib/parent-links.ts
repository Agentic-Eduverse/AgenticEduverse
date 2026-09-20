import { createHash, randomBytes } from 'crypto'
import { prisma } from '@eduverse/db'

export interface ParentInvitation {
  id: string
  studentId: string
  studentName: string
  classId: string
  parentEmail: string
  expiresAt: Date
  redeemedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function createParentInvitation(
  teacherId: string,
  input: { studentId: string; classId: string; parentEmail: string }
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_classId: { studentId: input.studentId, classId: input.classId } },
    include: {
      class: { select: { teacherId: true } },
      student: { select: { name: true, role: true } },
    },
  })
  if (!enrollment || enrollment.class.teacherId !== teacherId || enrollment.student.role !== 'STUDENT') {
    throw new Error('STUDENT_NOT_IN_CLASS')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const invitation = await prisma.parentInvitation.create({
    data: {
      tokenHash: hashToken(token),
      teacherId,
      studentId: input.studentId,
      classId: input.classId,
      parentEmail: normalizeEmail(input.parentEmail),
      expiresAt,
    },
  })
  return { id: invitation.id, token, expiresAt, studentName: enrollment.student.name }
}

export async function listParentInvitations(teacherId: string, classId: string): Promise<ParentInvitation[]> {
  const rows = await prisma.parentInvitation.findMany({
    where: { teacherId, classId, class: { teacherId } },
    include: { student: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    classId: row.classId,
    parentEmail: row.parentEmail,
    expiresAt: row.expiresAt,
    redeemedAt: row.redeemedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }))
}

export async function revokeParentInvitation(teacherId: string, invitationId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.parentInvitation.findFirst({ where: { id: invitationId, teacherId }, select: { id: true } })
    if (!invitation) return false
    await tx.parentInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } })
    await tx.parentStudentLink.updateMany({ where: { invitationId, revokedAt: null }, data: { revokedAt: new Date() } })
    return true
  })
}

export async function redeemParentInvitation(parent: { id: string; email: string; role: string }, token: string) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.parentInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { student: { select: { name: true } } },
    })
    if (!invitation) throw new Error('INVALID_INVITATION')
    if (parent.role !== 'PARENT' || normalizeEmail(parent.email) !== invitation.parentEmail) throw new Error('INVITATION_EMAIL_MISMATCH')
    if (invitation.revokedAt) throw new Error('INVITATION_REVOKED')
    if (invitation.redeemedAt) throw new Error('INVITATION_USED')
    if (invitation.expiresAt.getTime() <= Date.now()) throw new Error('INVITATION_EXPIRED')

    await tx.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: invitation.studentId } },
      create: {
        parentId: parent.id,
        studentId: invitation.studentId,
        createdByTeacherId: invitation.teacherId,
        invitationId: invitation.id,
      },
      update: {
        createdByTeacherId: invitation.teacherId,
        invitationId: invitation.id,
        revokedAt: null,
      },
    })
    await tx.parentInvitation.update({
      where: { id: invitation.id },
      data: { redeemedAt: new Date(), redeemedBy: parent.id },
    })
    return { studentId: invitation.studentId, studentName: invitation.student.name }
  })
}

export async function listLinkedChildren(parentId: string) {
  const rows = await prisma.parentStudentLink.findMany({
    where: { parentId, revokedAt: null },
    include: { student: { select: { id: true, name: true } } },
    orderBy: { student: { name: 'asc' } },
  })
  return rows.map((row) => row.student)
}

export async function unlinkChild(parentId: string, studentId: string): Promise<boolean> {
  const result = await prisma.parentStudentLink.updateMany({
    where: { parentId, studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count > 0
}

export async function isLinkedParent(parentId: string, studentId: string): Promise<boolean> {
  return Boolean(await prisma.parentStudentLink.findFirst({
    where: { parentId, studentId, revokedAt: null },
    select: { id: true },
  }))
}
