import { createHmac, timingSafeEqual } from 'crypto'
import type { Socket } from 'socket.io'
import { prisma } from './prisma'
import { redisClient } from './state'

interface SocketTicketPayload {
  sub: string
  purpose: 'socket-connect'
  jti: string
  iat: number
  exp: number
}

function decodeAndVerifyTicket(token: string): SocketTicketPayload {
  const secret = process.env.SOCKET_TICKET_SECRET
  if (!secret || secret.length < 32) throw new Error('TICKET_SECRET_MISSING')
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('INVALID_TICKET')
  const [encodedPayload, providedSignature] = parts
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest()
  const provided = Buffer.from(providedSignature, 'base64url')
  if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) {
    throw new Error('INVALID_TICKET')
  }
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SocketTicketPayload
  const now = Math.floor(Date.now() / 1000)
  if (payload.purpose !== 'socket-connect' || !payload.sub || !payload.jti || payload.exp <= now || payload.iat > now + 5) {
    throw new Error('INVALID_TICKET')
  }
  return payload
}

export async function verifySocketAuth(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || token.length > 4096) return next(new Error('UNAUTHORIZED'))
    const ticket = decodeAndVerifyTicket(token)
    const remainingTtl = Math.max(1, ticket.exp - Math.floor(Date.now() / 1000))
    const firstUse = await redisClient.set(`socket_ticket:${ticket.jti}`, '1', 'EX', remainingTtl, 'NX')
    if (firstUse !== 'OK') return next(new Error('UNAUTHORIZED'))

    const user = await prisma.user.findUnique({
      where: { id: ticket.sub },
      select: { id: true, name: true, role: true, avatarConfig: true },
    })
    if (!user) return next(new Error('UNAUTHORIZED'))

    socket.data.userId = user.id
    socket.data.userName = user.name
    socket.data.userRole = user.role === 'TEACHER' ? 'teacher' : user.role === 'PARENT' ? 'parent' : 'student'
    socket.data.avatarConfig = user.avatarConfig
    next()
  } catch (error) {
    console.warn(`[auth] rejected socket connection id=${socket.id}`)
    next(new Error('UNAUTHORIZED'))
  }
}
