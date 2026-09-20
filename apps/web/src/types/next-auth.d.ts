import type { DefaultSession } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { Role } from '@eduverse/shared'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
    } & DefaultSession['user']
  }

  interface User {
    role: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    role?: Role
  }
}
