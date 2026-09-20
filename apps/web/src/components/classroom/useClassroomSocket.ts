'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import type {
  Participant,
  EmotionType,
  ChatMessage,
  QuizResponse,
  AnswerSubmission,
  QuizScoreEntry,
  RolePlayRole,
  RolePlayActionData,
  ClientToServerEvents,
  ServerToClientEvents,
  WhiteboardEventData,
  TutoringState,
} from '@eduverse/shared'

interface RecentEmotion {
  userId: string
  emotion: EmotionType
  timestamp: number
}

export interface UseClassroomSocketReturn {
  connected: boolean
  classroomLive: boolean
  participants: Participant[]
  emotions: Record<string, EmotionType>
  recentEmotions: RecentEmotion[]
  activeQuiz: QuizResponse | null
  messages: ChatMessage[]
  quizScores: QuizScoreEntry[]
  lastEndedQuizId: string | null
  tutoring: TutoringState | null
  rolePlayRoles: RolePlayRole[]
  rolePlayMessages: ChatMessage[]
  teacherAnnouncements: string[]
  whiteboardEvents: WhiteboardEventData[]
  /** Bumped whenever anyone in the room reports that the class material list changed. */
  classFilesVersion: number
  joinClassroom: (classId: string, userId: string) => void
  sendEmotion: (emotion: EmotionType) => void
  sendChat: (content: string) => void
  raiseHand: () => Promise<boolean | null>
  resolveHand: (studentId: string) => Promise<boolean>
  startTutoring: (studentId: string) => Promise<boolean>
  endTutoring: () => Promise<boolean>
  submitAnswer: (quizId: string, answers: AnswerSubmission[]) => Promise<boolean>
  startQuiz: (quizId: string) => Promise<boolean>
  endQuiz: () => Promise<boolean>
  endClassroom: () => Promise<boolean>
  sendWhiteboardAction: (action: 'stroke' | 'clear' | 'undo', payload: unknown) => Promise<boolean>
  sendRolePlayAction: (action: string, data: RolePlayActionData) => void
  notifyClassFilesChanged: () => Promise<boolean>
}

export function useClassroomSocket(): UseClassroomSocketReturn {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const joinedRef = useRef(false)
  const desiredJoinRef = useRef<{ classId: string; userId: string } | null>(null)
  const lastConnectionErrorRef = useRef(0)
  const [connected, setConnected] = useState(false)
  const [classroomLive, setClassroomLive] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [emotions, setEmotions] = useState<Record<string, EmotionType>>({})
  const [recentEmotions, setRecentEmotions] = useState<RecentEmotion[]>([])
  const [activeQuiz, setActiveQuiz] = useState<QuizResponse | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [quizScores, setQuizScores] = useState<QuizScoreEntry[]>([])
  const [lastEndedQuizId, setLastEndedQuizId] = useState<string | null>(null)
  const [tutoring, setTutoring] = useState<TutoringState | null>(null)
  const [rolePlayRoles, setRolePlayRoles] = useState<RolePlayRole[]>([])
  const [rolePlayMessages, setRolePlayMessages] = useState<ChatMessage[]>([])
  const [teacherAnnouncements, setTeacherAnnouncements] = useState<string[]>([])
  const [whiteboardEvents, setWhiteboardEvents] = useState<WhiteboardEventData[]>([])
  const [classFilesVersion, setClassFilesVersion] = useState(0)

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      auth: async (callback) => {
        try {
          const response = await fetch('/api/socket-ticket', { method: 'POST' })
          const result = await response.json() as { success?: boolean; data?: { token?: string } }
          callback({ token: response.ok && result.success ? result.data?.token || '' : '' })
        } catch {
          callback({ token: '' })
        }
      },
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    const joinDesiredClass = () => {
      const desired = desiredJoinRef.current
      if (!desired) return
      joinedRef.current = false
      socket.emit('join-classroom', desired.classId, desired.userId, (result) => {
        joinedRef.current = Boolean(result?.success)
        setConnected(Boolean(result?.success))
        setClassroomLive(Boolean(result?.success))
        if (!result?.success) toast.error('无法加入实时课堂，请确认班级权限')
      })
    }

    socket.on('connect', () => {
      joinDesiredClass()
    })

    socket.on('disconnect', () => {
      setConnected(false)
      setClassroomLive(false)
      joinedRef.current = false
    })

    socket.on('connect_error', () => {
      setConnected(false)
      setClassroomLive(false)
      const now = Date.now()
      if (now - lastConnectionErrorRef.current > 10_000) {
        lastConnectionErrorRef.current = now
        toast.error('实时课堂连接失败，正在重试')
      }
    })

    socket.on('classroom-state', (newParticipants: Participant[], newEmotions: Record<string, EmotionType>, quiz?: QuizResponse) => {
      setParticipants(newParticipants)
      setEmotions(newEmotions)
      setActiveQuiz(quiz ?? null)
    })

    socket.on('emotion-update', (newEmotions: Record<string, EmotionType>) => {
      setEmotions((previous) => ({ ...previous, ...newEmotions }))
      const now = Date.now()
      const entries = Object.entries(newEmotions)
      if (entries.length > 0) {
        setRecentEmotions((prev) => {
          const next = [...prev]
          for (const [userId, emotion] of entries) {
            const prevIdx = next.findIndex((e) => e.userId === userId)
            if (prevIdx >= 0) {
              next.splice(prevIdx, 1)
            }
            next.push({ userId, emotion, timestamp: now })
          }
          return next.slice(-100)
        })
      }
    })

    socket.on('new-question', (quiz: QuizResponse) => {
      setActiveQuiz(quiz)
    })

    socket.on('quiz-result', (scores: QuizScoreEntry[]) => {
      setQuizScores(scores)
    })
    socket.on('quiz-ended', (quizId) => setLastEndedQuizId(quizId))
    socket.on('tutoring-state', setTutoring)

    socket.on('role-play-update', (roles: RolePlayRole[], rpMessages: ChatMessage[]) => {
      setRolePlayRoles(roles)
      setRolePlayMessages(rpMessages)
    })

    socket.on('teacher-announcement', (message: string) => {
      setTeacherAnnouncements((prev) => [...prev, message].slice(-50))
      if (message && message.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant' as const, content: message, timestamp: new Date() },
        ].slice(-200))
      }
    })
    socket.on('chat-history', (history) => setMessages(history))
    socket.on('classroom-message', (message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-200)))

    socket.on('whiteboard-state', (events) => setWhiteboardEvents(events))
    socket.on('whiteboard-action', (event) => setWhiteboardEvents((current) => [...current, event].slice(-2000)))
    socket.on('class-files-changed', () => setClassFilesVersion((version) => version + 1))
    socket.on('classroom-ended', () => {
      setActiveQuiz(null)
      setClassroomLive(false)
      setTutoring(null)
      toast.info('本节课堂已结束')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setRecentEmotions((prev) => prev.filter((e) => now - e.timestamp < 30000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const joinClassroom = useCallback((classId: string, userId: string) => {
    desiredJoinRef.current = { classId, userId }
    const socket = socketRef.current
    if (!socket?.connected) return
    joinedRef.current = false
    socket.emit('join-classroom', classId, userId, (result) => {
      joinedRef.current = Boolean(result?.success)
      setConnected(Boolean(result?.success))
      setClassroomLive(Boolean(result?.success))
      if (!result?.success) toast.error('无法加入实时课堂，请确认班级权限')
    })
  }, [])

  const sendEmotion = useCallback((emotion: EmotionType) => {
    if (joinedRef.current) socketRef.current?.emit('emotion', emotion, Date.now())
  }, [])

  const sendChat = useCallback((content: string) => {
    const trimmed = content.trim()
    if (!joinedRef.current || !trimmed) return
    socketRef.current?.emit('chat-message', trimmed)
  }, [])

  const raiseHand = useCallback(() => new Promise<boolean | null>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(null)
    socket.emit('raise-hand', (result) => resolve(result.success ? result.isRaised : null))
  }), [])

  const resolveHand = useCallback((studentId: string) => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('resolve-hand', studentId, (result) => resolve(Boolean(result.success)))
  }), [])

  const startTutoring = useCallback((studentId: string) => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('start-tutoring', studentId, (result) => resolve(Boolean(result.success)))
  }), [])

  const endTutoring = useCallback(() => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('end-tutoring', (result) => resolve(Boolean(result.success)))
  }), [])

  const submitAnswer = useCallback((quizId: string, answers: AnswerSubmission[]) => {
    return new Promise<boolean>((resolve) => {
      const socket = socketRef.current
      if (!joinedRef.current || !socket) return resolve(false)
      let settled = false
      const timer = window.setTimeout(() => {
        if (!settled) resolve(false)
        settled = true
      }, 8_000)
      socket.emit('submit-answer', quizId, answers, (result) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(Boolean(result?.success))
      })
    })
  }, [])

  const sendRolePlayAction = useCallback((action: string, data: RolePlayActionData) => {
    if (joinedRef.current) socketRef.current?.emit('role-play-action', action, data)
  }, [])

  const startQuiz = useCallback((quizId: string) => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('start-quiz', quizId, (result) => resolve(Boolean(result?.success)))
  }), [])

  const endQuiz = useCallback(() => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('end-quiz', (result) => resolve(Boolean(result?.success)))
  }), [])

  const endClassroom = useCallback(() => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('end-classroom', (result) => resolve(Boolean(result?.success)))
  }), [])

  const sendWhiteboardAction = useCallback((action: 'stroke' | 'clear' | 'undo', payload: unknown) => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('whiteboard-action', action, payload, (result) => resolve(Boolean(result?.success)))
  }), [])

  const notifyClassFilesChanged = useCallback(() => new Promise<boolean>((resolve) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket) return resolve(false)
    socket.emit('class-files-changed', (result) => resolve(Boolean(result?.success)))
  }), [])

  return {
    connected,
    classroomLive,
    participants,
    emotions,
    recentEmotions,
    activeQuiz,
    messages,
    quizScores,
    lastEndedQuizId,
    tutoring,
    rolePlayRoles,
    rolePlayMessages,
    teacherAnnouncements,
    whiteboardEvents,
    classFilesVersion,
    joinClassroom,
    sendEmotion,
    sendChat,
    raiseHand,
    resolveHand,
    startTutoring,
    endTutoring,
    submitAnswer,
    startQuiz,
    endQuiz,
    endClassroom,
    sendWhiteboardAction,
    sendRolePlayAction,
    notifyClassFilesChanged,
  }
}
