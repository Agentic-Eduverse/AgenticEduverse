import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@eduverse/db'
import type { Role } from '@eduverse/shared'
import { verifyPassword } from '@/lib/password'
import { takeRateLimit } from '@/lib/rate-limit'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = String(credentials.email).trim().toLowerCase()
        if (!takeRateLimit(`login:${email}`, 10, 15 * 60_000)) return null
        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user || !user.password) {
          return null
        }

        const isValid = await verifyPassword(
          String(credentials.password),
          user.password
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        session.user.role = token.role
        session.user.id = String(token.userId || token.sub || '')
      }
      return session
    },
  },
})

export const { GET, POST } = handlers
