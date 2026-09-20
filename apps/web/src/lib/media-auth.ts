import { AccessToken } from 'livekit-server-sdk'

export function mediaConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
}

export async function createMediaToken(input: { identity: string; name: string; roomName: string; canPublish: boolean }) {
  if (!mediaConfigured()) throw new Error('MEDIA_NOT_CONFIGURED')
  // A lesson runs far longer than 10 minutes. The token is only checked when a participant
  // joins (and on reconnect), so a short TTL meant anyone whose connection blipped mid-class
  // could not get back in. 4 hours covers a class plus margin while staying bounded.
  const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { identity: input.identity, name: input.name, ttl: '4h' })
  token.addGrant({ roomJoin: true, room: input.roomName, canSubscribe: true, canPublish: input.canPublish, canPublishData: true })
  return token.toJwt()
}
