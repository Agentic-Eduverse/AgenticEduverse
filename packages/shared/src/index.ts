export type Role = 'TEACHER' | 'STUDENT' | 'PARENT'
export type UserRole = 'teacher' | 'student' | 'parent' | 'admin'
export type EmotionType = 'confused' | 'happy' | 'repeat' | 'need_repeat' | 'idea' | 'have_idea'

export interface ApiResponse<T = unknown> { success: boolean; data: T; error?: string; message: string; statusCode: number }
export interface UserSafe { id: string; email: string; name: string; role: UserRole; avatarConfig?: unknown; coins: number; createdAt: Date }
export interface Participant { userId: string; name: string; role: UserRole; avatarConfig?: unknown; joinedAt?: Date; isHandRaised?: boolean }
export interface ChatMessage { id?: string; userId?: string; userName?: string; role: 'system' | 'user' | 'assistant'; content: string; timestamp?: Date }

export interface QuizOption { id: string; text: string; isCorrect?: boolean }
export interface QuizQuestion {
  id: string
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer'
  text: string
  options?: QuizOption[]
  correctAnswer?: string | string[]
  points?: number
  explanation?: string
}
export interface QuizResponse {
  id: string; classId: string; title: string; questions: QuizQuestion[]; createdBy: string; createdAt: Date
  isActive?: boolean; timeLimitSeconds?: number; startedAt?: Date; sessionId?: string
}
export interface AnswerSubmission { questionId: string; selectedOptionIds?: string[]; textAnswer?: string }

export function calculateQuizScore(submittedAnswers: AnswerSubmission[], questions: QuizQuestion[]) {
  let rawScore = 0
  let totalPoints = 0
  let correctCount = 0
  for (const question of questions) {
    const points = Number.isFinite(question.points) && (question.points || 0) > 0 ? question.points! : 1
    totalPoints += points
    const submission = submittedAnswers.find((answer) => answer.questionId === question.id)
    if (!submission) continue
    let correct = false
    if (question.type === 'single_choice' || question.type === 'true_false') {
      const expected = question.options?.find((option) => option.isCorrect)?.id || (typeof question.correctAnswer === 'string' ? question.correctAnswer : '')
      const selected = submission.selectedOptionIds || []
      correct = Boolean(expected) && selected.length === 1 && selected[0] === expected
    } else if (question.type === 'multiple_choice') {
      const marked = question.options?.filter((option) => option.isCorrect).map((option) => option.id) || []
      const expected = marked.length ? marked : Array.isArray(question.correctAnswer) ? question.correctAnswer : []
      const selected = submission.selectedOptionIds || []
      correct = expected.length > 0 && expected.length === selected.length && [...expected].sort().every((id, index) => id === [...selected].sort()[index])
    } else {
      const expected = typeof question.correctAnswer === 'string' ? question.correctAnswer.trim().toLocaleLowerCase() : ''
      const actual = (submission.textAnswer || '').trim().toLocaleLowerCase()
      correct = expected.length > 0 && actual === expected
    }
    if (correct) { rawScore += points; correctCount += 1 }
  }
  return { rawScore, totalPoints, correctCount, totalQuestions: questions.length, percentage: totalPoints > 0 ? Math.round((rawScore / totalPoints) * 100) : 0 }
}
export interface QuizScoreEntry { userId: string; score: number; totalPoints: number; correctCount: number; totalQuestions: number; rank: number }
export interface WhiteboardEventData { id: string; sequence: number; action: 'stroke' | 'clear' | 'undo'; payload: unknown; createdAt: string | Date }
export interface TutoringState { id: string; classId: string; teacherId: string; studentId: string; status: 'ACTIVE' | 'ENDED'; startedAt: string | Date; endedAt?: string | Date | null }

export interface RolePlayRole { id?: string; name: string; background: string; objective?: string; secretObjective?: string }
export interface RolePlayActionData { message?: string; scenarioId?: string; roleName?: string; [key: string]: unknown }
export interface RolePlayAssignment { assignments: Record<string, string> }
export interface RolePlayScenario {
  id: string; title: string; description: string; roles: RolePlayRole[]; subject?: string
  difficultyLevel?: string; classId: string; createdAt: Date
}

export interface ClassResponse {
  id: string; name: string; teacherId: string; teacherName?: string; roomCode: string; scheduledAt?: Date
  duration: number; isLive: boolean; createdAt: Date; enrollmentsCount: number
}
export interface PreviewResponse { script: string; keyPoints: string[]; difficulties: string[]; previewQuestions: string[] }
export interface GeneratePreClassPreviewParams {
  classId: string; subject: string; topic: string; materials: string; teachingStyle?: string; gradeLevel: string; durationMinutes?: number
}
export interface StudentTutorResponse {
  answer: string; guidingQuestions: string[]
  practiceExercises: Array<{ question: string; options?: string[]; answer: string; explanation: string }>
  encouragement: string
}
export interface ParentReportResponse { strengths: string[]; areasToSupport: string[]; homeActivities: string[]; encouragementMessage: string }
export interface AnalyticsResponse {
  engagementScore: number | null; totalConfusions: number; totalSpeeches: number; averageQuizScore: number | null
  confusedMoments: unknown[]; studentsInNeed: unknown[]; suggestedAdjustments: string[]; quizAccuracy: unknown[]
}
export interface SessionData {
  sessionId: string; classId: string; startedAt: Date; endedAt?: Date
  messages: Array<{ userId: string; role: string; content: string; createdAt: Date }>
  emotionLogs: Array<{ userId: string; emotion: string; timestamp: Date }>
  quizResults: Array<{ quizId: string; title: string; submissions: Array<{ userId: string; score: number }> }>
}

type Ack<T extends object = object> = (result: { success: boolean } & T) => void
export interface ClientToServerEvents {
  'join-classroom': (classId: string, userId: string, callback?: Ack<{ message?: string }>) => void
  emotion: (emotion: EmotionType, timestamp: number, callback?: Ack<{ coinsEarned?: number }>) => void
  'chat-message': (content: string, callback?: Ack<{ messageId?: string }>) => void
  'raise-hand': (callback?: Ack<{ isRaised: boolean }>) => void
  'resolve-hand': (studentId: string, callback?: Ack) => void
  'start-tutoring': (studentId: string, callback?: Ack<{ tutoring?: TutoringState }>) => void
  'end-tutoring': (callback?: Ack) => void
  'submit-answer': (quizId: string, answers: AnswerSubmission[], callback?: Ack<{ submissionId?: string }>) => void
  'start-quiz': (quizId: string, callback?: Ack) => void
  'end-quiz': (callback?: Ack) => void
  'end-classroom': (callback?: Ack) => void
  'whiteboard-action': (action: 'stroke' | 'clear' | 'undo', payload: unknown, callback?: Ack<{ event?: WhiteboardEventData }>) => void
  'role-play-action': (action: string, data: RolePlayActionData, callback?: Ack) => void
  /**
   * The upload itself goes through /api/classes/[id]/files, which is a different process from
   * this socket server. The teacher's client therefore announces the change here so everyone
   * already inside the classroom reloads the material list instead of only seeing it after a
   * manual refresh.
   */
  'class-files-changed': (callback?: Ack) => void
}
export interface ServerToClientEvents {
  'classroom-state': (participants: Participant[], emotions: Record<string, EmotionType>, quiz?: QuizResponse) => void
  'emotion-update': (emotions: Record<string, EmotionType>) => void
  'new-question': (quiz: QuizResponse) => void
  'quiz-result': (scores: QuizScoreEntry[]) => void
  'quiz-ended': (quizId: string) => void
  'role-play-update': (roles: RolePlayRole[], messages: ChatMessage[]) => void
  'teacher-announcement': (message: string) => void
  'chat-history': (messages: ChatMessage[]) => void
  'classroom-message': (message: ChatMessage) => void
  'whiteboard-state': (events: WhiteboardEventData[]) => void
  'whiteboard-action': (event: WhiteboardEventData) => void
  'classroom-ended': (endedAt: string) => void
  'tutoring-state': (state: TutoringState | null) => void
  'class-files-changed': (payload: { classId: string; count: number; at: string }) => void
}
export interface InterServerEvents { ping: () => void }
export interface SocketData {
  userId?: string; userName?: string; userRole?: UserRole; avatarConfig?: unknown; classId?: string
  joinedAt?: Date; lastActiveAt?: Date; connectionId?: string
  sessionId?: string; attendanceId?: string
}
