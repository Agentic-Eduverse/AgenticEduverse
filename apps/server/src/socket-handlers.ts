import type { Server, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  AnswerSubmission,
  QuizScoreEntry,
  QuizQuestion,
  QuizResponse,
  WhiteboardEventData,
  RolePlayActionData,
  Participant,
  RolePlayRole,
  ChatMessage,
  EmotionType,
  TutoringState,
} from '@eduverse/shared'
import { prisma, Prisma } from './lib/prisma'
import {
  addUserToClass,
  removeUserFromClass,
  getClassParticipants,
  setActiveQuiz,
  getActiveQuiz,
  batchEmotion,
  addHandRaise,
  removeHandRaise,
  isHandRaised,
  appendRolePlayMessage,
  getRolePlayRoles,
  setRolePlayRoles,
} from './lib/state'
import { createEmotionBatcher, calculateQuizScore } from './lib/utils'

type ServerType = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type SocketType = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const emotionBatchers = new Map<string, ReturnType<typeof createEmotionBatcher>>()
const ALLOWED_EMOTIONS = new Set(['confused', 'happy', 'repeat', 'need_repeat', 'idea', 'have_idea'])

function getRoomName(classId: string): string {
  return `class:${classId}`
}

function errorLabel(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.name : 'UnknownError'
}

function normalizeWhiteboardPayload(action: 'stroke' | 'clear' | 'undo', payload: unknown): Prisma.InputJsonValue | null {
  if (action !== 'stroke') return {}
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = payload as { points?: unknown; color?: unknown; width?: unknown }
  if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 2000) return null
  const points = value.points.flatMap((point) => {
    if (!point || typeof point !== 'object') return []
    const candidate = point as { x?: unknown; y?: unknown }
    if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number' || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || candidate.x < 0 || candidate.x > 1 || candidate.y < 0 || candidate.y > 1) return []
    return [{ x: candidate.x, y: candidate.y }]
  })
  if (points.length !== value.points.length) return null
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#1e293b'
  const width = typeof value.width === 'number' && Number.isFinite(value.width) ? Math.min(20, Math.max(1, value.width)) : 3
  return { points, color, width } as Prisma.InputJsonValue
}

function hideQuizAnswers(quiz: QuizResponse | null): QuizResponse | null {
  if (!quiz) return null
  return {
    ...quiz,
    questions: quiz.questions.map((question) => {
      const { correctAnswer: _correctAnswer, explanation: _explanation, ...safeQuestion } = question
      return {
        ...safeQuestion,
        options: question.options?.map(({ isCorrect: _isCorrect, ...option }) => option),
      } as QuizQuestion
    }),
  }
}

function getOrCreateEmotionBatcher(io: ServerType, classId: string) {
  let batcher = emotionBatchers.get(classId)
  if (!batcher) {
    batcher = createEmotionBatcher(io, classId)
    emotionBatchers.set(classId, batcher)
  }
  return batcher
}

async function getOrCreateSessionId(classId: string): Promise<string> {
  const existingSession = await prisma.session.findFirst({
    where: { classId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })
  if (existingSession) return existingSession.id
  const newSession = await prisma.session.create({ data: { classId }, select: { id: true } })
  return newSession.id
}

async function broadcastClassroomState(
  io: ServerType,
  classId: string,
  options?: { teacherOnly?: boolean }
): Promise<void> {
  const participants = await getClassParticipants(classId)
  const activeQuiz = await getActiveQuiz(classId)
  const emotions: Record<string, EmotionType> = {}
  const roomName = getRoomName(classId)

  if (options?.teacherOnly) {
    const sockets = await io.in(roomName).fetchSockets()
    for (const sock of sockets) {
      if (sock.data.userRole === 'teacher' || sock.data.userRole === 'admin') {
        sock.emit('classroom-state', participants, emotions, activeQuiz ?? undefined)
      }
    }
  } else {
    const sockets = await io.in(roomName).fetchSockets()
    for (const sock of sockets) {
      const visibleQuiz = sock.data.userRole === 'student' ? hideQuizAnswers(activeQuiz) : activeQuiz
      sock.emit('classroom-state', participants, emotions, visibleQuiz ?? undefined)
    }
  }
}

async function emitTutoringState(io: ServerType, classId: string, state: TutoringState | null, userIds: string[]): Promise<void> {
  const allowed = new Set(userIds)
  const sockets = await io.in(getRoomName(classId)).fetchSockets()
  for (const target of sockets) if (target.data.userId && allowed.has(target.data.userId)) target.emit('tutoring-state', state)
}

export function registerSocketHandlers(io: ServerType, socket: SocketType): void {
  let joinedClassId: string | null = null
  const recentEvents = new Map<string, number[]>()

  const allowEvent = (name: string, limit: number, windowMs: number): boolean => {
    const now = Date.now()
    const recent = (recentEvents.get(name) ?? []).filter((timestamp) => now - timestamp < windowMs)
    if (recent.length >= limit) return false
    recent.push(now)
    recentEvents.set(name, recent)
    return true
  }

  const canAccessClass = async (classId: string): Promise<boolean> => {
    const userId = socket.data.userId
    if (!userId) return false
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!cls) return false
    if (socket.data.userRole === 'teacher') return cls.teacherId === userId
    if (socket.data.userRole !== 'student') return false
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: userId, classId } },
      select: { id: true },
    })
    return Boolean(enrollment)
  }

  socket.on('join-classroom', async (classId, userId, callback) => {
    try {
      const resolvedUserId = socket.data.userId
      if (!resolvedUserId || !classId) {
        callback?.({ success: false, message: 'Missing classId or userId' })
        return
      }

      if (!allowEvent('join-classroom', 10, 60_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false, message: 'You do not have access to this classroom' })
        return
      }

      if (joinedClassId && joinedClassId !== classId) {
        await socket.leave(getRoomName(joinedClassId))
        const wentOffline = await removeUserFromClass(joinedClassId, resolvedUserId, socket.id)
        if (wentOffline && socket.data.attendanceId) await prisma.attendance.update({ where: { id: socket.data.attendanceId }, data: { leftAt: new Date() } })
        if (wentOffline) {
          const tutoring = await prisma.tutoringSession.findFirst({ where: { classId: joinedClassId, status: 'ACTIVE', OR: [{ teacherId: resolvedUserId }, { studentId: resolvedUserId }] }, orderBy: { startedAt: 'desc' } })
          if (tutoring) {
            await prisma.tutoringSession.update({ where: { id: tutoring.id }, data: { status: 'ENDED', endedAt: new Date() } })
            await emitTutoringState(io, joinedClassId, null, [tutoring.teacherId, tutoring.studentId])
          }
        }
      }

      joinedClassId = classId
      socket.data.userId = resolvedUserId
      socket.data.classId = classId
      socket.data.joinedAt = new Date()
      socket.data.lastActiveAt = new Date()
      socket.data.connectionId = socket.id
      if (!socket.data.userRole) socket.data.userRole = 'student'

      await socket.join(getRoomName(classId))

      await addUserToClass(classId, resolvedUserId, socket.id, {
        userId: resolvedUserId,
        name: socket.data.userName ?? resolvedUserId,
        role: socket.data.userRole ?? 'student',
        avatarConfig: socket.data.avatarConfig,
      })

      let sessionId: string
      if (socket.data.userRole === 'teacher') {
        sessionId = await getOrCreateSessionId(classId)
      } else {
        const liveClass = await prisma.class.findUnique({ where: { id: classId }, select: { isLive: true } })
        const activeSession = liveClass?.isLive
          ? await prisma.session.findFirst({ where: { classId, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { id: true } })
          : null
        if (!activeSession) {
          await socket.leave(getRoomName(classId))
          await removeUserFromClass(classId, resolvedUserId, socket.id)
          joinedClassId = null
          callback?.({ success: false, message: 'Classroom is not live' })
          return
        }
        sessionId = activeSession.id
      }
      const existingAttendance = await prisma.attendance.findFirst({ where: { sessionId, userId: resolvedUserId, leftAt: null }, select: { id: true } })
      const attendance = existingAttendance || await prisma.attendance.create({ data: { sessionId, classId, userId: resolvedUserId }, select: { id: true } })
      socket.data.sessionId = sessionId
      socket.data.attendanceId = attendance.id
      if (socket.data.userRole === 'teacher') await prisma.class.update({ where: { id: classId }, data: { isLive: true } })

      await broadcastClassroomState(io, classId)
      const whiteboardEvents = await prisma.whiteboardEvent.findMany({ where: { classId }, select: { id: true, sequence: true, action: true, payload: true, createdAt: true }, orderBy: { sequence: 'asc' }, take: 2000 })
      socket.emit('whiteboard-state', whiteboardEvents as unknown as WhiteboardEventData[])
      const history = await prisma.message.findMany({ where: { sessionId }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take: 200 })
      socket.emit('chat-history', history.map((message) => ({ id: message.id, userId: message.userId, userName: message.user.name, role: message.role === 'teacher' ? 'assistant' : 'user', content: message.content, timestamp: message.createdAt })))
      const tutoring = await prisma.tutoringSession.findFirst({
        where: { classId, status: 'ACTIVE', OR: [{ teacherId: resolvedUserId }, { studentId: resolvedUserId }] },
        orderBy: { startedAt: 'desc' },
      })
      if (tutoring) socket.emit('tutoring-state', { ...tutoring, status: 'ACTIVE' } as TutoringState)
      callback?.({ success: true, message: 'Joined classroom successfully' })
    } catch (err) {
      console.error('[join-classroom] error:', errorLabel(err))
      callback?.({ success: false, message: 'Failed to join classroom' })
    }
  })

  socket.on('emotion', async (emotion, timestamp, callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (
        !userId || !classId || socket.data.userRole !== 'student' ||
        !allowEvent('emotion', 20, 10_000) ||
        !ALLOWED_EMOTIONS.has(String(emotion)) ||
        !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000 ||
        !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }

      const sessionId = await getOrCreateSessionId(classId)
      await prisma.emotionLog.create({
        data: { sessionId, userId, emotion, timestamp: new Date(timestamp) },
      })
      await batchEmotion(classId, userId, emotion, timestamp)
      getOrCreateEmotionBatcher(io, classId).add(userId, emotion, timestamp)

      socket.data.lastActiveAt = new Date()
      callback?.({ success: true, coinsEarned: 0 })
    } catch (err) {
      console.error('[emotion] error:', errorLabel(err))
      callback?.({ success: false })
    }
  })

  socket.on('chat-message', async (content, callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (
        !userId || !classId || typeof content !== 'string' ||
        !content.trim() || content.trim().length > 2_000 ||
        !allowEvent('chat-message', 20, 10_000) ||
        !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }

      const sessionId = await getOrCreateSessionId(classId)
      const created = await prisma.message.create({
        data: {
          sessionId,
          userId,
          content: content.trim(),
          role: socket.data.userRole ?? 'student',
        },
      })
      const messageId = created.id

      io.to(getRoomName(classId)).emit('classroom-message', {
        id: created.id,
        userId,
        userName: socket.data.userName || '用户',
        role: socket.data.userRole === 'teacher' ? 'assistant' : 'user',
        content: content.trim(),
        timestamp: created.createdAt,
      })
      socket.data.lastActiveAt = new Date()
      callback?.({ success: true, messageId })
    } catch (err) {
      console.error('[chat-message] error:', errorLabel(err))
      callback?.({ success: false })
    }
  })

  socket.on('raise-hand', async (callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (
        !userId || !classId || socket.data.userRole !== 'student' ||
        !allowEvent('raise-hand', 10, 10_000) ||
        !(await canAccessClass(classId))
      ) {
        callback?.({ success: false, isRaised: false })
        return
      }

      const currentlyRaised = await isHandRaised(classId, userId)
      const activeTutoring = await prisma.tutoringSession.count({ where: { classId, studentId: userId, status: 'ACTIVE' } })
      if (activeTutoring > 0) {
        callback?.({ success: false, isRaised: false })
        return
      }
      let isRaised: boolean
      if (currentlyRaised) {
        await removeHandRaise(classId, userId)
        isRaised = false
      } else {
        await addHandRaise(classId, userId)
        isRaised = true
      }

      await broadcastClassroomState(io, classId, { teacherOnly: true })
      socket.data.lastActiveAt = new Date()
      callback?.({ success: true, isRaised })
    } catch (err) {
      console.error('[raise-hand] error:', errorLabel(err))
      callback?.({ success: false, isRaised: false })
    }
  })

  socket.on('resolve-hand', async (studentId, callback) => {
    try {
      const classId = socket.data.classId ?? joinedClassId
      if (!classId || socket.data.userRole !== 'teacher' || typeof studentId !== 'string' || !studentId || !allowEvent('resolve-hand', 20, 10_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false })
        return
      }
      const enrollment = await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId, classId } }, select: { id: true } })
      if (!enrollment) {
        callback?.({ success: false })
        return
      }
      await removeHandRaise(classId, studentId)
      await broadcastClassroomState(io, classId)
      callback?.({ success: true })
    } catch (error) {
      console.error('[resolve-hand] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('start-tutoring', async (studentId, callback) => {
    try {
      const teacherId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (!teacherId || !classId || socket.data.userRole !== 'teacher' || typeof studentId !== 'string' || !allowEvent('start-tutoring', 10, 60_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false }); return
      }
      const enrollment = await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId, classId } }, select: { id: true } })
      if (!enrollment) { callback?.({ success: false }); return }
      const participants = await getClassParticipants(classId)
      if (!participants.some((participant) => participant.userId === studentId)) { callback?.({ success: false }); return }
      const activeSession = await prisma.session.findFirst({ where: { classId, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { id: true } })
      if (!activeSession) { callback?.({ success: false }); return }
      const now = new Date()
      const tutoring = await prisma.$transaction(async (tx) => {
        await tx.tutoringSession.updateMany({ where: { classId, status: 'ACTIVE', OR: [{ teacherId }, { studentId }] }, data: { status: 'ENDED', endedAt: now } })
        return tx.tutoringSession.create({ data: { classId, sessionId: activeSession.id, teacherId, studentId } })
      })
      await removeHandRaise(classId, studentId)
      const state = { ...tutoring, status: 'ACTIVE' as const }
      await emitTutoringState(io, classId, state, [teacherId, studentId])
      await broadcastClassroomState(io, classId)
      callback?.({ success: true, tutoring: state })
    } catch (error) {
      console.error('[start-tutoring] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('end-tutoring', async (callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (!userId || !classId || !allowEvent('end-tutoring', 10, 60_000) || !(await canAccessClass(classId))) { callback?.({ success: false }); return }
      const tutoring = await prisma.tutoringSession.findFirst({ where: { classId, status: 'ACTIVE', OR: [{ teacherId: userId }, { studentId: userId }] }, orderBy: { startedAt: 'desc' } })
      if (!tutoring) { callback?.({ success: false }); return }
      await prisma.tutoringSession.update({ where: { id: tutoring.id }, data: { status: 'ENDED', endedAt: new Date() } })
      await emitTutoringState(io, classId, null, [tutoring.teacherId, tutoring.studentId])
      callback?.({ success: true })
    } catch (error) {
      console.error('[end-tutoring] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('whiteboard-action', async (action, payload, callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (!userId || !classId || socket.data.userRole !== 'teacher' || !['stroke', 'clear', 'undo'].includes(action) || !allowEvent('whiteboard-action', 30, 10_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false }); return
      }
      const normalizedPayload = normalizeWhiteboardPayload(action, payload)
      if (normalizedPayload === null) { callback?.({ success: false }); return }
      const event = await prisma.$transaction(async (tx) => {
        const latest = await tx.whiteboardEvent.findFirst({ where: { classId }, orderBy: { sequence: 'desc' }, select: { sequence: true } })
        return tx.whiteboardEvent.create({ data: { classId, userId, sequence: (latest?.sequence || 0) + 1, action, payload: normalizedPayload }, select: { id: true, sequence: true, action: true, payload: true, createdAt: true } })
      })
      const response = event as unknown as WhiteboardEventData
      io.to(getRoomName(classId)).emit('whiteboard-action', response)
      callback?.({ success: true, event: response })
    } catch (error) {
      console.error('[whiteboard-action] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('class-files-changed', async (callback) => {
    try {
      const classId = socket.data.classId ?? joinedClassId
      if (!classId || socket.data.userRole !== 'teacher' || !allowEvent('class-files-changed', 20, 10_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false }); return
      }
      // Only a count is broadcast - the list itself is fetched over HTTP, which already
      // enforces per-role access.
      const count = await prisma.classFile.count({ where: { classId } })
      io.to(getRoomName(classId)).emit('class-files-changed', { classId, count, at: new Date().toISOString() })
      callback?.({ success: true })
    } catch (error) {
      console.error('[class-files-changed] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('start-quiz', async (quizId, callback) => {
    try {
      const classId = socket.data.classId ?? joinedClassId
      if (
        !classId || socket.data.userRole !== 'teacher' || typeof quizId !== 'string' ||
        !allowEvent('start-quiz', 5, 60_000) || !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }
      const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
      if (!quiz || quiz.classId !== classId || quiz.status !== 'DRAFT') {
        callback?.({ success: false })
        return
      }
      const alreadyActive = await prisma.quiz.findFirst({ where: { classId, status: 'ACTIVE' }, select: { id: true } })
      if (alreadyActive) {
        callback?.({ success: false })
        return
      }
      const sessionId = await getOrCreateSessionId(classId)
      const startedAt = new Date()
      await prisma.$transaction([
        prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'ACTIVE', startedAt, endedAt: null, sessionId } }),
        prisma.class.update({ where: { id: classId }, data: { isLive: true } }),
      ])
      const activeQuiz: QuizResponse = {
        id: quiz.id,
        classId: quiz.classId,
        title: quiz.title,
        questions: quiz.questions as unknown as QuizQuestion[],
        createdBy: quiz.createdBy,
        createdAt: quiz.createdAt,
        isActive: true,
        timeLimitSeconds: quiz.timeLimitSeconds,
        startedAt,
        sessionId,
      }
      await setActiveQuiz(classId, activeQuiz)
      await broadcastClassroomState(io, classId)
      callback?.({ success: true })
    } catch (error) {
      console.error('[start-quiz] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('end-quiz', async (callback) => {
    try {
      const classId = socket.data.classId ?? joinedClassId
      if (
        !classId || socket.data.userRole !== 'teacher' ||
        !allowEvent('end-quiz', 5, 60_000) || !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }
      const active = await prisma.quiz.findFirst({ where: { classId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' }, select: { id: true } })
      if (active) {
        await prisma.quiz.update({ where: { id: active.id }, data: { status: 'ENDED', endedAt: new Date() } })
        io.to(getRoomName(classId)).emit('quiz-ended', active.id)
      }
      await setActiveQuiz(classId, null)
      await broadcastClassroomState(io, classId)
      callback?.({ success: true })
    } catch (error) {
      console.error('[end-quiz] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('end-classroom', async (callback) => {
    try {
      const classId = socket.data.classId ?? joinedClassId
      if (!classId || socket.data.userRole !== 'teacher' || !allowEvent('end-classroom', 3, 60_000) || !(await canAccessClass(classId))) {
        callback?.({ success: false })
        return
      }
      const activeRecording = await prisma.recording.count({ where: { classId, status: { in: ['STARTING', 'ACTIVE', 'STOPPING'] } } })
      if (activeRecording > 0) {
        callback?.({ success: false })
        return
      }
      const endedAt = new Date()
      const session = await prisma.session.findFirst({ where: { classId, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { id: true } })
      const endedQuizzes = await prisma.$transaction(async (tx) => {
        await tx.class.update({ where: { id: classId }, data: { isLive: false } })
        if (session) {
          await tx.session.update({ where: { id: session.id }, data: { endedAt } })
          await tx.attendance.updateMany({ where: { sessionId: session.id, leftAt: null }, data: { leftAt: endedAt } })
        }
        const activeQuizzes = await tx.quiz.findMany({ where: { classId, status: 'ACTIVE' }, select: { id: true } })
        await tx.quiz.updateMany({ where: { classId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt } })
        await tx.tutoringSession.updateMany({ where: { classId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt } })
        return activeQuizzes
      })
      await setActiveQuiz(classId, null)
      endedQuizzes.forEach((quiz) => io.to(getRoomName(classId)).emit('quiz-ended', quiz.id))
      io.to(getRoomName(classId)).emit('classroom-ended', endedAt.toISOString())
      await broadcastClassroomState(io, classId)
      callback?.({ success: true })
    } catch (error) {
      console.error('[end-classroom] error:', errorLabel(error))
      callback?.({ success: false })
    }
  })

  socket.on('submit-answer', async (quizId, answers, callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (
        !userId || !classId || socket.data.userRole !== 'student' ||
        typeof quizId !== 'string' || !Array.isArray(answers) || answers.length > 200 ||
        !allowEvent('submit-answer', 5, 60_000) ||
        !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }

      const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        select: { id: true, questions: true, classId: true, status: true, startedAt: true, timeLimitSeconds: true },
      })

      const deadline = quiz?.startedAt ? quiz.startedAt.getTime() + quiz.timeLimitSeconds * 1000 : 0
      if (!quiz || quiz.classId !== classId || quiz.status !== 'ACTIVE' || !deadline || Date.now() > deadline + 5_000) {
        callback?.({ success: false })
        return
      }

      const questions = (quiz.questions as unknown) as QuizQuestion[]
      const result = calculateQuizScore(answers as AnswerSubmission[], questions)
      const score = result.percentage

      const submission = await prisma.$transaction(async (tx) => {
        const existing = await tx.submission.findFirst({ where: { userId, quizId }, select: { id: true } })
        if (existing) throw new Error('ALREADY_SUBMITTED')
        const created = await tx.submission.create({
          data: {
            userId,
            quizId,
            answers: answers as unknown as Prisma.InputJsonValue,
            score,
            rawScore: result.rawScore,
            totalPoints: result.totalPoints,
            correctCount: result.correctCount,
          },
        })
        if (score === 100) {
          await tx.user.update({ where: { id: userId }, data: { coins: { increment: 10 } } })
          await tx.rewardLedger.create({ data: { userId, eventKey: `quiz-perfect:${userId}:${quizId}`, reason: 'QUIZ_PERFECT', amount: 10 } })
        }
        return created
      }, { isolationLevel: 'Serializable' })

      const allSubmissions = await prisma.submission.findMany({
        where: { quizId },
        select: { userId: true, score: true, rawScore: true, totalPoints: true, correctCount: true },
        orderBy: { score: 'desc' },
      })

      const scoreMap = new Map<string, { score: number; totalPoints: number; correctCount: number; totalQuestions: number; rank: number }>()
      allSubmissions.forEach((sub, idx) => {
        scoreMap.set(sub.userId, {
          score: sub.score ?? 0,
          totalPoints: sub.totalPoints ?? 0,
          correctCount: sub.correctCount ?? 0,
          totalQuestions: result.totalQuestions,
          rank: idx + 1,
        })
      })

      const scores: QuizScoreEntry[] = Array.from(scoreMap.entries()).map(([uid, entry]) => ({
        userId: uid,
        score: entry.score,
        totalPoints: entry.totalPoints,
        correctCount: entry.correctCount,
        totalQuestions: entry.totalQuestions,
        rank: entry.rank,
      }))

      io.to(getRoomName(classId)).emit('quiz-result', scores)
      socket.data.lastActiveAt = new Date()
      callback?.({ success: true, submissionId: submission.id })
    } catch (err) {
      console.error('[submit-answer] error:', errorLabel(err))
      callback?.({ success: false })
    }
  })

  socket.on('role-play-action', async (action, data, callback) => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      const actionMessage = (data as RolePlayActionData)?.message
      if (
        !userId || !classId || typeof action !== 'string' || !action.trim() || action.length > 100 ||
        (typeof actionMessage === 'string' && actionMessage.length > 2_000) ||
        !allowEvent('role-play-action', 20, 10_000) ||
        !(await canAccessClass(classId))
      ) {
        callback?.({ success: false })
        return
      }

      const chatMessage: ChatMessage = {
        role: 'user',
        content: (data as RolePlayActionData).message ?? action,
        timestamp: new Date(),
      }
      const scenarioId = (data as RolePlayActionData).scenarioId
      const scenarios = await prisma.rolePlayScenario.findMany({
        where: { classId, ...(scenarioId ? { id: scenarioId } : {}) },
        select: { id: true, roles: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
      if (scenarios.length === 0) {
        callback?.({ success: false })
        return
      }
      if (scenarios[0].status !== 'ACTIVE') {
        callback?.({ success: false })
        return
      }
      let roles = await getRolePlayRoles(scenarios[0].id)
      if (roles.length === 0) {
        roles = scenarios[0].roles as unknown as RolePlayRole[]
        await setRolePlayRoles(scenarios[0].id, roles)
      }

      await prisma.rolePlayScenario.update({
        where: { id: scenarios[0].id },
        data: { summary: (chatMessage.content ?? '').slice(0, 500) },
      })
      await prisma.rolePlayMessage.create({
        data: { scenarioId: scenarios[0].id, userId, roleName: (data as RolePlayActionData).roleName, content: chatMessage.content },
      })
      const messages = await appendRolePlayMessage(scenarios[0].id, chatMessage)
      io.to(getRoomName(classId)).emit('role-play-update', roles, messages)

      socket.data.lastActiveAt = new Date()
      callback?.({ success: true })
    } catch (err) {
      console.error('[role-play-action] error:', errorLabel(err))
      callback?.({ success: false })
    }
  })

  socket.on('disconnect', async () => {
    try {
      const userId = socket.data.userId
      const classId = socket.data.classId ?? joinedClassId
      if (userId && classId) {
        const wentOffline = await removeUserFromClass(classId, userId, socket.id)
        if (wentOffline && socket.data.attendanceId) await prisma.attendance.update({ where: { id: socket.data.attendanceId }, data: { leftAt: new Date() } })
        if (wentOffline) {
          const tutoring = await prisma.tutoringSession.findFirst({ where: { classId, status: 'ACTIVE', OR: [{ teacherId: userId }, { studentId: userId }] }, orderBy: { startedAt: 'desc' } })
          if (tutoring) {
            await prisma.tutoringSession.update({ where: { id: tutoring.id }, data: { status: 'ENDED', endedAt: new Date() } })
            await emitTutoringState(io, classId, null, [tutoring.teacherId, tutoring.studentId])
          }
        }
        await broadcastClassroomState(io, classId)
      }
      const batcher = classId ? emotionBatchers.get(classId) : undefined
      if (batcher && classId) {
        const remainingSockets = await io.in(getRoomName(classId)).fetchSockets()
        if (remainingSockets.length === 0) {
          batcher.flush()
          batcher.cancel()
          emotionBatchers.delete(classId)
        }
      }
    } catch (err) {
      console.error('[disconnect] error:', errorLabel(err))
    }
  })
}

export { broadcastClassroomState }
