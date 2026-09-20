import { toast } from 'sonner'
import type { ApiResponse } from '@eduverse/shared'
import type { QuizQuestion } from '@eduverse/shared'

const DEFAULT_TIMEOUT_MS = 15_000

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    })
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const message = res.ok ? '服务器返回了无法识别的数据' : `请求失败（${res.status}）`
      toast.error(message)
      throw new ApiRequestError(message, res.status, 'INVALID_RESPONSE')
    }
    const parsed: unknown = await res.json()
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { success?: unknown }).success !== 'boolean') {
      const message = '服务器响应格式不正确'
      toast.error(message)
      throw new ApiRequestError(message, res.status, 'INVALID_RESPONSE')
    }
    const data = parsed as ApiResponse<T>
    if (!res.ok || !data.success) {
      const message = data.message || '请求失败，请稍后重试'
      toast.error(message)
      throw new ApiRequestError(message, res.status, String(data.error || 'REQUEST_FAILED'))
    }
    if (!('data' in data)) {
      const message = '服务器响应缺少数据'
      toast.error(message)
      throw new ApiRequestError(message, res.status, 'INVALID_RESPONSE')
    }
    return data.data
  } catch (error) {
    if (error instanceof ApiRequestError) throw error
    if (controller.signal.aborted) {
      const message = options.signal?.aborted ? '请求已取消' : '请求超时，请重试'
      if (!options.signal?.aborted) toast.error(message)
      throw new ApiRequestError(message, 0, options.signal?.aborted ? 'ABORTED' : 'TIMEOUT')
    }
    const message = '无法连接服务器，请检查网络后重试'
    toast.error(message)
    throw new ApiRequestError(message, 0, 'NETWORK_ERROR')
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export interface ClientClass {
  id: string
  name: string
  roomCode: string
  isLive: boolean
  enrollmentsCount: number
  teacherName?: string
  scheduledAt?: string | Date
  duration: number
  hasPassword?: boolean
  students?: Array<{ id: string; name: string }>
  recentSessions?: Array<{ id: string; startedAt: string | Date; endedAt?: string | Date | null }>
}

export interface ClientPreviewResponse {
  script: string
  keyPoints: string[]
  difficulties: string[]
  previewQuestions: string[]
  materialId?: string
}

export interface TutorMessage {
  videoKeywords?: string[]
  role: 'user' | 'assistant'
  content: string
  practiceProblem?: { question: string; options?: string[]; answer: string; explanation: string }
}

/** A third-party explanation video offered under a tutor answer. */
export interface TutorVideo {
  id: string
  title: string
  url: string
  cover: string | null
  duration: string | null
  author: string | null
  source: 'bilibili'
}

export interface ClientParentReport {
  strengths: string[]
  areasToSupport: string[]
  homeActivities: string[]
  encouragementMessage: string
}

export interface ClientRolePlayRole {
  id?: string
  name: string
  avatar?: string
  background: string
  goal?: string
  objective?: string
  secretMission?: string
  secretObjective?: string
  personalityColor?: string
}

export interface ClientRolePlayScenario {
  id: string
  title: string
  description: string
  roles: ClientRolePlayRole[]
  assignments?: Record<string, string>
  classId: string
  className?: string
  messages?: Array<{ id: string; userId: string; roleName?: string | null; content: string; createdAt: string }>
  enrolledStudents?: Array<{ userId: string; name: string }>
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED'
  startedAt?: string | null
  endedAt?: string | null
}

export interface ClassAnalytics {
  engagementScore: number | null
  totalConfusions: number
  totalSpeeches: number
  averageQuizScore: number | null
  confusedMoments: { id: string; timestamp: string; topic: string }[]
  studentsInNeed: { id: string; name: string; reason: string; level: 'warning' | 'error' }[]
  suggestedAdjustments: string[]
  quizAccuracy: { questionNumber: number; correctRate: number }[]
}

export interface ClientQuiz {
  id: string
  title: string
  questions: QuizQuestion[]
  status: 'DRAFT' | 'ACTIVE' | 'ENDED'
  source: 'MANUAL' | 'AI'
  timeLimitSeconds: number
  submissionCount: number
  createdAt: string
  startedAt?: string | null
  endedAt?: string | null
}

export const api = {
  classes: {
    list: async () => {
      const data = await request<{ classes: ClientClass[] }>('/api/classes', { method: 'GET' })
      return data.classes
    },
    create: async (body: { name: string; startTime: string; durationMinutes: number; password?: string }) => {
      const data = await request<{ class: ClientClass }>('/api/classes', {
        method: 'POST',
        body: JSON.stringify({ name: body.name, scheduledAt: body.startTime, duration: body.durationMinutes, password: body.password }),
      })
      return data.class
    },
    lookup: async (roomCode: string) => {
      const data = await request<{ class: ClientClass }>(`/api/classes/lookup?roomCode=${encodeURIComponent(roomCode)}`, { method: 'GET' })
      return data.class
    },
    join: (id: string, body: { roomCode: string; password?: string }) =>
      request<{ enrollment: unknown; coinsEarned: number; totalCoins: number }>(`/api/classes/${id}/join`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    get: async (id: string) => {
      const data = await request<{ class: ClientClass }>(`/api/classes/${id}`, { method: 'GET' })
      return data.class
    },
  },
  user: {
    me: async () => {
      const data = await request<{ user: { id: string; name: string; email: string; role: string; coins: number } }>('/api/user/me', { method: 'GET' })
      return data.user
    },
    updateAvatar: (avatarConfig: Record<string, unknown>) =>
      request<{ avatarConfig: unknown; coinsEarned: number; totalCoins: number }>('/api/user/avatar', {
        method: 'PATCH', body: JSON.stringify({ avatarConfig }),
      }),
  },
  student: {
    stats: () => request<{ studyMinutes: number; accuracy: number | null; rewards: number; coins: number; weakPoints: string[] }>('/api/student/stats', { method: 'GET' }),
  },
  auth: {
    register: async (body: { name: string; email: string; password: string; role: string }) => {
      const data = await request<{ user: { id: string } }>('/api/auth/register', {
        method: 'POST', body: JSON.stringify({ ...body, role: body.role.toUpperCase() }),
      })
      return data.user
    },
  },
  ai: {
    status: async () => {
      const data = await request<{ configured: boolean; model: string | null; tutorConfigured: boolean; tutorModel: string | null }>('/api/ai/status', { method: 'GET' })
      return data
    },
    generateQuizDraft: async (body: { classId: string; material: string; count: number; difficulty?: string }) => {
      const data = await request<{ draft: { title: string; questions: QuizQuestion[] } }>('/api/ai/quiz', {
        method: 'POST', body: JSON.stringify(body),
      }, 60_000)
      return data.draft
    },
  },
  media: {
    status: () => request<{ configured: boolean; url: string | null }>('/api/media/status', { method: 'GET' }),
    token: (classId: string, tutoringId?: string) => request<{ token: string; url: string }>('/api/media/token', { method: 'POST', body: JSON.stringify({ classId, tutoringId }) }),
    startRecording: (classId: string) => request<{ recording: { id: string; status: string } }>('/api/media/recording', { method: 'POST', body: JSON.stringify({ action: 'start', classId }) }, 30_000),
    stopRecording: (recordingId: string) => request<{ recording: { id: string; status: string } }>('/api/media/recording', { method: 'POST', body: JSON.stringify({ action: 'stop', recordingId }) }, 30_000),
    // Keeps the server-side row marked as alive. Without it an orphaned row (browser crash,
    // reload, closed tab) would block every later recording with "该课堂已在录制".
    heartbeatRecording: (recordingId: string) => request<{ ok: boolean }>('/api/media/recording', { method: 'POST', body: JSON.stringify({ action: 'heartbeat', recordingId }) }, 15_000),
    uploadRecording: (recordingId: string, blob: Blob) =>
      request<{ recording: { id: string; status: string }; size: number }>(
        `/api/media/recording/${encodeURIComponent(recordingId)}/upload`,
        { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'video/webm' } },
        // A classroom recording can be tens of megabytes; give the upload room to finish.
        300_000
      ),
    recordings: (classId: string) => request<{ recordings: Array<{ id: string; status: string; startedAt: string; endedAt: string | null; publishedAt: string | null }>; canPublish: boolean }>(`/api/media/recording?classId=${encodeURIComponent(classId)}`, { method: 'GET' }),
    publishRecording: (recordingId: string) => request<{ recording: { id: string; publishedAt: string } }>('/api/media/recording', { method: 'POST', body: JSON.stringify({ action: 'publish', recordingId }) }),
  },
  preview: {
    generate: async (body: { classId: string; teachingStyle: 'warm' | 'rigorous' | 'humorous'; courseMaterial: string; teacherSample?: string }) => {
      const data = await request<{ preview: Omit<ClientPreviewResponse, 'materialId'>; materialId: string }>('/api/ai/preview', {
        method: 'POST',
        body: JSON.stringify({ classId: body.classId, material: body.courseMaterial, teachingStyle: body.teachingStyle, teacherSample: body.teacherSample }),
      }, 60_000)
      return { ...data.preview, materialId: data.materialId }
    },
    publish: (materialId: string, body: { script: string; keyPoints: string[]; difficulties: string[]; previewQuestions: string[] }) =>
      request<{ materialId: string; coinsEarned: number; totalCoins: number }>(`/api/ai/preview/material/${encodeURIComponent(materialId)}`, {
        method: 'PUT', body: JSON.stringify(body),
      }),
  },
  tutor: {
    history: async (agentId = 'general') => {
      const data = await request<{ history: Array<{
        userMessage: string
        subject: string | null
        response: { answer: string; practiceExercises?: Array<{ question: string; options?: string[]; answer: string; explanation: string }> }
        timestamp: string
      }> }>(`/api/ai/tutor?agentId=${encodeURIComponent(agentId)}`, { method: 'GET' })
      return data.history
    },
    chat: async (body: { messages: TutorMessage[]; subject?: string; agentId?: string; context?: string; model?: string }) => {
      const lastUserIndex = body.messages.map((message) => message.role).lastIndexOf('user')
      const current = lastUserIndex >= 0 ? body.messages[lastUserIndex] : undefined
      if (!current) throw new ApiRequestError('消息不能为空', 400, 'EMPTY_MESSAGE')
      const data = await request<{ tutor: { answer: string; videoKeywords?: string[]; practiceExercises?: Array<{ question: string; options?: string[]; answer: string; explanation: string }> } }>('/api/ai/tutor', {
        method: 'POST',
        body: JSON.stringify({
          message: current.content,
          history: body.messages.slice(0, lastUserIndex).map(({ role, content }) => ({ role, content })),
          subject: body.subject,
          agentId: body.agentId,
          contextClassId: body.context,
          model: body.model,
        }),
      }, 60_000)
      return { role: 'assistant' as const, content: data.tutor.answer, videoKeywords: data.tutor.videoKeywords, practiceProblem: data.tutor.practiceExercises?.[0] }
    },
    saveHistory: (body: {
      agentId?: string
      userMessage: string
      subject?: string
      response: { answer: string; practiceExercises?: Array<{ question: string; options?: string[]; answer: string; explanation: string }> }
    }) =>
      request<{ history: unknown[] }>('/api/ai/tutor/history', { method: 'POST', body: JSON.stringify(body) }),
    // Up to five explanation videos for a knowledge point. Empty on any upstream problem - the
    // caller simply renders nothing.
    videos: async (query: string) => {
      const data = await request<{ videos: TutorVideo[] }>(
        `/api/ai/tutor/videos?q=${encodeURIComponent(query)}`,
        { method: 'GET' },
        15_000
      )
      return data.videos
    },
  },
  parent: {
    getChildren: async () => {
      const data = await request<{ children: Array<{ id: string; name: string; grade?: string }> }>('/api/parent-links/children', { method: 'GET' })
      return data.children
    },
    dashboard: (studentId: string, weekStart: string) => request<{
      children: Array<{ id: string; name: string; grade?: string }>
      attendanceCount: number
      attendanceMinutes: number
      emotionFeedbacks: number
      averageQuizScore: number | null
      coinsEarned: number
      emotionTrend: Array<{ date: string; happy: number; confused: number }>
      subjectScores: Array<{ subject: string; score: number }>
    }>(`/api/parent/dashboard?studentId=${encodeURIComponent(studentId)}&weekStart=${encodeURIComponent(weekStart)}`, { method: 'GET' }),
    generateReport: async (body: { studentId: string; weekStart: string }) => {
      const weekEnd = new Date(`${body.weekStart}T00:00:00.000Z`)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
      const data = await request<{ report: ClientParentReport }>('/api/ai/parent-report', {
        method: 'POST', body: JSON.stringify({ ...body, weekEnd: weekEnd.toISOString() }),
      }, 60_000)
      return data.report
    },
  },
  parentLinks: {
    createInvitation: (body: { studentId: string; classId: string; parentEmail: string }) =>
      request<{ id: string; token: string; path: string; expiresAt: string; studentName: string }>('/api/parent-links/invitations', {
        method: 'POST', body: JSON.stringify(body),
      }),
    listInvitations: async (classId: string) => {
      const data = await request<{ invitations: Array<{ id: string; studentName: string; parentEmail: string; expiresAt: string; redeemedAt: string | null; revokedAt: string | null }> }>(`/api/parent-links/invitations?classId=${encodeURIComponent(classId)}`, { method: 'GET' })
      return data.invitations
    },
    revokeInvitation: (id: string) => request<{ id: string }>(`/api/parent-links/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    redeem: (token: string) => request<{ child: { studentId: string; studentName: string } }>('/api/parent-links/redeem', {
      method: 'POST', body: JSON.stringify({ token }),
    }),
    unlink: (studentId: string) => request<{ studentId: string }>(`/api/parent-links/children/${encodeURIComponent(studentId)}`, { method: 'DELETE' }),
  },
  roleplay: {
    list: async () => {
      const data = await request<{ scenarios: Array<ClientRolePlayScenario & { classId: string; className: string; createdAt: string }> }>('/api/roleplay', { method: 'GET' })
      return data.scenarios
    },
    create: async (body: { classId: string; title: string; description: string; roles: Array<{ name: string; background: string; objective: string; secretObjective?: string }> }) => {
      const data = await request<{ scenario: ClientRolePlayScenario }>('/api/roleplay', { method: 'POST', body: JSON.stringify(body) })
      return data.scenario
    },
    get: async (id: string) => {
      const data = await request<{ scenario: ClientRolePlayScenario }>(`/api/roleplay/${id}`, { method: 'GET' })
      return data.scenario
    },
    assignRoles: (id: string, assignments?: Record<string, string>) => request<{ assignments: { assignments: Record<string, string> } }>(`/api/roleplay/${id}/assign`, { method: 'POST', body: assignments ? JSON.stringify({ assignments }) : undefined }),
    setStatus: (id: string, action: 'start' | 'end') => request<{ scenario: ClientRolePlayScenario }>(`/api/roleplay/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
    update: (id: string, body: { title: string; description: string; roles: Array<{ id?: string; name: string; background: string; objective: string; secretObjective?: string }> }) => request<{ scenario: ClientRolePlayScenario }>(`/api/roleplay/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'update', ...body }) }),
  },
  quiz: {
    result: (quizId: string) => request<{ quiz: import('@eduverse/shared').QuizResponse; result: { score: number | null; rawScore: number | null; totalPoints: number | null; correctCount: number | null } }>(`/api/quiz/${encodeURIComponent(quizId)}/result`, { method: 'GET' }),
    list: async (classId: string) => {
      const data = await request<{ quizzes: ClientQuiz[] }>(`/api/quiz?classId=${encodeURIComponent(classId)}`, { method: 'GET' })
      return data.quizzes
    },
    create: async (body: { classId: string; title: string; questions: QuizQuestion[]; timeLimitSeconds: number; source: 'MANUAL' | 'AI' }) => {
      const data = await request<{ quiz: { id: string } }>('/api/quiz', {
        method: 'POST',
        body: JSON.stringify({
          classId: body.classId,
          title: body.title,
          timeLimitSeconds: body.timeLimitSeconds,
          source: body.source,
          questions: body.questions.map(({ text, ...question }) => ({ ...question, questionText: text })),
        }),
      })
      return data.quiz
    },
  },
  analytics: {
    generate: async (sessionId: string) => {
      const data = await request<{ analytics: ClassAnalytics }>(`/api/ai/analytics/${sessionId}`, { method: 'POST' }, 60_000)
      return data.analytics
    },
  },
}
