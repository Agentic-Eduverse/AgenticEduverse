import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

type Role = 'TEACHER' | 'STUDENT' | 'PARENT'

const ROLE_ROUTE_MAP: Record<string, Role> = {
  '/teacher': 'TEACHER',
  '/student': 'STUDENT',
  '/parent': 'PARENT',
}

export async function middleware(req: NextRequest) {
  const { nextUrl } = req
  if (nextUrl.pathname === '/api/media/webhook') return NextResponse.next()
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const salt = req.cookies.has('__Secure-authjs.session-token') ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const token = secret ? await getToken({ req, secret, salt }) : null
  const isApiRoute = nextUrl.pathname.startsWith('/api/')

  if (!token) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: '请先登录', statusCode: 401 },
        { status: 401 }
      )
    }
    const callbackUrl = nextUrl.pathname + nextUrl.search
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl))
  }

  for (const [prefix, requiredRole] of Object.entries(ROLE_ROUTE_MAP)) {
    if (nextUrl.pathname === prefix || nextUrl.pathname.startsWith(`${prefix}/`)) {
      if (String(token.role || '').toUpperCase() !== requiredRole) {
        // Send the visitor to that portal's login instead of silently bouncing them to the
        // landing page - otherwise every portal looks like it "redirects to the student
        // page", with no hint about why.
        return NextResponse.redirect(
          new URL(`/login?role=${requiredRole.toLowerCase()}`, nextUrl)
        )
      }
      break
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/teacher/:path*', '/student/:path*', '/parent/:path*', '/roleplay/:path*',
    '/api/ai/:path*', '/api/classes/:path*', '/api/quiz/:path*', '/api/user/:path*',
    '/api/roleplay/:path*', '/api/parent-links/:path*', '/api/socket-ticket',
    '/api/parent/:path*', '/api/student/:path*',
    '/api/media/:path*', '/recordings/:path*',
  ],
}
