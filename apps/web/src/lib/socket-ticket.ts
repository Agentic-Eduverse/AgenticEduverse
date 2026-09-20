import { createHmac, randomUUID } from 'crypto'

const TICKET_TTL_SECONDS = 60

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

export function createSocketTicket(userId: string): { token: string; expiresAt: string } {
  const secret = process.env.SOCKET_TICKET_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SOCKET_TICKET_SECRET must contain at least 32 characters')
  }
  const now = Math.floor(Date.now() / 1000)
  const payload = encode(JSON.stringify({
    sub: userId,
    purpose: 'socket-connect',
    jti: randomUUID(),
    iat: now,
    exp: now + TICKET_TTL_SECONDS,
  }))
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return { token: `${payload}.${signature}`, expiresAt: new Date((now + TICKET_TTL_SECONDS) * 1000).toISOString() }
}
