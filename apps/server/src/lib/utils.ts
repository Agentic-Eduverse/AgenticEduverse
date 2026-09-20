import type { Server } from 'socket.io'
import type { EmotionType } from '@eduverse/shared'
export { calculateQuizScore } from '@eduverse/shared'

const EMOTION_BATCH_WINDOW = 100
const emotionBatchTimers = new Map<string, NodeJS.Timeout>()
const emotionBatchBuffers = new Map<string, Map<string, EmotionType>>()

interface EmotionBatchEntry {
  userId: string
  emotion: EmotionType
  timestamp: number
}

export function createEmotionBatcher(io: Server, classId: string) {
  const roomName = `class:${classId}`

  const flush = () => {
    const buffer = emotionBatchBuffers.get(classId)
    if (buffer && buffer.size > 0) {
      const emotionsMap: Record<string, EmotionType> = {}
      buffer.forEach((emotion, userId) => {
        emotionsMap[userId] = emotion
      })
      try {
        io.to(roomName).emit('emotion-update', emotionsMap)
      } catch (err) {
        console.error('[emotion-batcher] failed to emit update:', err instanceof Error ? err.name : 'UnknownError')
      }
      buffer.clear()
    }
    emotionBatchTimers.delete(classId)
  }

  const add = (userId: string, emotion: EmotionType, timestamp: number) => {
    if (!emotionBatchBuffers.has(classId)) {
      emotionBatchBuffers.set(classId, new Map())
    }
    const buffer = emotionBatchBuffers.get(classId)!
    buffer.set(userId, emotion)

    if (!emotionBatchTimers.has(classId)) {
      const timer = setTimeout(flush, EMOTION_BATCH_WINDOW)
      emotionBatchTimers.set(classId, timer)
    }
  }

  const cancel = () => {
    const timer = emotionBatchTimers.get(classId)
    if (timer) {
      clearTimeout(timer)
      emotionBatchTimers.delete(classId)
    }
    emotionBatchBuffers.delete(classId)
  }

  return { add, cancel, flush }
}

export type { EmotionBatchEntry }
