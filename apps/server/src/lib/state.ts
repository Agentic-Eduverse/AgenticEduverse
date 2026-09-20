import Redis from 'ioredis'
import RedisMock from 'ioredis-mock'
import type { ChatMessage, EmotionType, Participant, QuizResponse, RolePlayRole, UserRole } from '@eduverse/shared'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// `memory://` keeps the realtime state in-process so local development works without a Redis
// server. It is single-instance only - use a real Redis URL for any multi-instance deployment.
const useInMemoryRedis = REDIS_URL === 'memory://'
if (useInMemoryRedis) {
  console.warn('[redis] REDIS_URL=memory:// - using an in-process Redis mock (single instance only)')
}

export const redisClient: Redis = useInMemoryRedis
  ? (new RedisMock() as unknown as Redis)
  : new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })

redisClient.on('error', (err) => {
  console.error('[redis] Client error:', err.message)
})

const USER_INFO_TTL_SECONDS = 86400

export interface UserInfo {
  userId: string
  name: string
  role: UserRole
  avatarConfig?: unknown
}

function userInfoKey(userId: string): string {
  return `user_info:${userId}`
}

function onlineUsersKey(classId: string): string {
  return `online_users:${classId}`
}

function userConnectionsKey(classId: string, userId: string): string {
  return `online_connections:${classId}:${userId}`
}

function activeQuizKey(classId: string): string {
  return `active_quiz:${classId}`
}

function handsUpKey(classId: string): string {
  return `hands_up:${classId}`
}

function emotionBatchKey(classId: string): string {
  return `emotion_batch:${classId}`
}

function rolePlayRolesKey(classId: string): string {
  return `roleplay_roles:${classId}`
}

function rolePlayMessagesKey(classId: string): string {
  return `roleplay_messages:${classId}`
}

async function safeRedisOp<T>(op: () => Promise<T>, _fallback: T, context: string): Promise<T> {
  try {
    return await op()
  } catch (err) {
    console.error(`[redis] ${context} error:`, err instanceof Error ? err.name : 'UnknownError')
    throw err
  }
}

export async function addUserToClass(
  classId: string,
  userId: string,
  connectionId: string,
  userInfo: UserInfo
): Promise<void> {
  const multi = redisClient.multi()
  multi.sadd(onlineUsersKey(classId), userId)
  multi.expire(onlineUsersKey(classId), USER_INFO_TTL_SECONDS)
  multi.sadd(userConnectionsKey(classId, userId), connectionId)
  multi.expire(userConnectionsKey(classId, userId), USER_INFO_TTL_SECONDS)
  multi.set(
    userInfoKey(userId),
    JSON.stringify(userInfo),
    'EX',
    USER_INFO_TTL_SECONDS
  )
  const result = await multi.exec()
  if (!result) throw new Error('REDIS_WRITE_FAILED')
}

export async function removeUserFromClass(
  classId: string,
  userId: string,
  connectionId: string
): Promise<boolean> {
  const connectionKey = userConnectionsKey(classId, userId)
  await redisClient.srem(connectionKey, connectionId)
  const remainingConnections = await redisClient.scard(connectionKey)
  if (remainingConnections > 0) return false
  const multi = redisClient.multi()
  multi.srem(onlineUsersKey(classId), userId)
  multi.srem(handsUpKey(classId), userId)
  multi.del(connectionKey)
  const result = await multi.exec()
  if (!result) throw new Error('REDIS_WRITE_FAILED')
  return true
}

export async function getClassParticipants(classId: string): Promise<Participant[]> {
  return safeRedisOp(
    async () => {
      const userIds = await redisClient.smembers(onlineUsersKey(classId))
      const handRaisedIds = await redisClient.smembers(handsUpKey(classId))
      const handRaisedSet = new Set(handRaisedIds)

      if (userIds.length === 0) return []

      const infoKeys = userIds.map(userInfoKey)
      const rawInfos = await redisClient.mget(...infoKeys)

      const participants: Participant[] = []
      for (let i = 0; i < userIds.length; i += 1) {
        const raw = rawInfos[i]
        const userId = userIds[i]
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as UserInfo
            participants.push({
              userId: parsed.userId,
              name: parsed.name,
              role: parsed.role,
              avatarConfig: parsed.avatarConfig,
              joinedAt: new Date(),
              isHandRaised: handRaisedSet.has(userId),
            })
          } catch {
            participants.push({
              userId,
              name: userId,
              role: 'student',
              isHandRaised: handRaisedSet.has(userId),
            })
          }
        } else {
          participants.push({
            userId,
            name: userId,
            role: 'student',
            isHandRaised: handRaisedSet.has(userId),
          })
        }
      }
      return participants
    },
    [],
    `getClassParticipants class=${classId}`
  )
}

export async function setActiveQuiz(
  classId: string,
  quiz: QuizResponse | null
): Promise<void> {
  await safeRedisOp(
    async () => {
      if (quiz === null) {
        await redisClient.del(activeQuizKey(classId))
      } else {
        await redisClient.set(
          activeQuizKey(classId),
          JSON.stringify(quiz),
          'EX',
          USER_INFO_TTL_SECONDS
        )
      }
    },
    undefined,
    `setActiveQuiz class=${classId}`
  )
}

export async function getActiveQuiz(
  classId: string
): Promise<QuizResponse | null> {
  return safeRedisOp(
    async () => {
      const raw = await redisClient.get(activeQuizKey(classId))
      if (!raw) return null
      return JSON.parse(raw) as QuizResponse
    },
    null,
    `getActiveQuiz class=${classId}`
  )
}

export async function batchEmotion(
  classId: string,
  userId: string,
  emotion: EmotionType,
  timestamp: number
): Promise<void> {
  const payload = JSON.stringify({ userId, emotion, timestamp })
  const multi = redisClient.multi()
  multi.lpush(emotionBatchKey(classId), payload)
  multi.ltrim(emotionBatchKey(classId), 0, 999)
  multi.expire(emotionBatchKey(classId), USER_INFO_TTL_SECONDS)
  const result = await multi.exec()
  if (!result) throw new Error('REDIS_WRITE_FAILED')
}

export async function addHandRaise(
  classId: string,
  userId: string
): Promise<boolean> {
  const result = await redisClient.sadd(handsUpKey(classId), userId)
  await redisClient.expire(handsUpKey(classId), USER_INFO_TTL_SECONDS)
  return result > 0
}

export async function removeHandRaise(
  classId: string,
  userId: string
): Promise<boolean> {
  const result = await redisClient.srem(handsUpKey(classId), userId)
  return result > 0
}

export async function isHandRaised(
  classId: string,
  userId: string
): Promise<boolean> {
  return (await redisClient.sismember(handsUpKey(classId), userId)) === 1
}

export async function getRolePlayRoles(classId: string): Promise<RolePlayRole[]> {
  const raw = await redisClient.get(rolePlayRolesKey(classId))
  return raw ? JSON.parse(raw) as RolePlayRole[] : []
}

export async function setRolePlayRoles(classId: string, roles: RolePlayRole[]): Promise<void> {
  await redisClient.set(rolePlayRolesKey(classId), JSON.stringify(roles), 'EX', USER_INFO_TTL_SECONDS)
}

export async function appendRolePlayMessage(classId: string, message: ChatMessage): Promise<ChatMessage[]> {
  const key = rolePlayMessagesKey(classId)
  const multi = redisClient.multi()
  multi.lpush(key, JSON.stringify(message))
  multi.ltrim(key, 0, 199)
  multi.expire(key, USER_INFO_TTL_SECONDS)
  const result = await multi.exec()
  if (!result) throw new Error('REDIS_WRITE_FAILED')
  const rawMessages = await redisClient.lrange(key, 0, 199)
  return rawMessages.reverse().map((raw) => {
    const parsed = JSON.parse(raw) as ChatMessage & { timestamp?: string }
    return { ...parsed, timestamp: parsed.timestamp ? new Date(parsed.timestamp) : undefined }
  })
}
