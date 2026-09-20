import { prisma, type User } from '@eduverse/db'
import type { Role } from '@eduverse/shared'
import { auth } from '@/auth'

export async function getCurrentUser(): Promise<User | null> {
  const session = await auth()
  if (!session?.user?.email) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  return user
}

export async function requireRole(role: Role | Role[]): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('未登录')
  }

  const requiredRoles = Array.isArray(role) ? role : [role]
  if (!requiredRoles.includes(user.role as Role)) {
    throw new Error(`权限不足，需要以下角色之一: ${requiredRoles.join(', ')}`)
  }

  return user
}
