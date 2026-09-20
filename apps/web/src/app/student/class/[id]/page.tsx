'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader } from '@/components/ui/loader'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useClassroomSocket } from '@/components/classroom/useClassroomSocket'
import ClassroomLayout from '@/components/classroom/ClassroomLayout'
import QuizModal from '@/components/classroom/QuizModal'
import EmotionBar from '@/components/classroom/EmotionBar'
import type { Participant, QuizResponse, AnswerSubmission } from '@eduverse/shared'
import { api, type ClientClass } from '@/lib/api-client'

export default function StudentClassPage() {
  const params = useParams()
  const classId = params?.id as string
  const { data: session } = useSession()

  const {
    connected,
    classroomLive,
    participants: socketParticipants,
    emotions,
    activeQuiz: socketActiveQuiz,
    messages,
    lastEndedQuizId,
    tutoring,
    joinClassroom,
    sendEmotion,
    sendChat,
    raiseHand,
    submitAnswer,
    whiteboardEvents,
    sendWhiteboardAction,
    classFilesVersion,
  } = useClassroomSocket()

  const [quizOpen, setQuizOpen] = useState(false)
  const [activeQuiz, setActiveQuiz] = useState<QuizResponse | null>(null)
  const [classInfo, setClassInfo] = useState<ClientClass | null>(null)
  const [quizResult, setQuizResult] = useState<{ score: number | null; rawScore: number | null; totalPoints: number | null; correctCount: number | null } | null>(null)

  const allParticipants = useMemo<Participant[]>(() => {
    if (socketParticipants && socketParticipants.length > 0) {
      return socketParticipants
    }
    return []
  }, [socketParticipants])

  const currentUser = useMemo<Participant>(() => ({
    userId: session?.user?.id || '',
    name: session?.user?.name || '学生',
    role: 'student',
  }), [session])

  useEffect(() => {
    if (session?.user?.id) joinClassroom(classId, session.user.id)
  }, [joinClassroom, classId, session?.user?.id])

  useEffect(() => { api.classes.get(classId).then(setClassInfo).catch(() => setClassInfo(null)) }, [classId])

  useEffect(() => {
    if (socketActiveQuiz) {
      setQuizResult(null)
      setActiveQuiz(socketActiveQuiz)
      setQuizOpen(true)
      toast.info('老师发起了一个新测验！')
    } else {
      setActiveQuiz(null)
      setQuizOpen(false)
    }
  }, [socketActiveQuiz])

  useEffect(() => {
    if (!lastEndedQuizId) return
    api.quiz.result(lastEndedQuizId).then(({ quiz, result }) => {
      setActiveQuiz(quiz)
      setQuizResult(result)
      setQuizOpen(true)
    }).catch(() => undefined)
  }, [lastEndedQuizId])

  const handleSubmitQuiz = async (answers: AnswerSubmission[]) => {
    const success = await submitAnswer(activeQuiz?.id || '', answers)
    const totalQ = activeQuiz?.questions?.length || 0
    if (success && totalQ > 0) {
      const answered = answers.length
      toast.success(`已提交 ${answered}/${totalQ} 题！`)
    } else if (!success) {
      toast.error('测验提交失败，请重试')
    }
    return success
  }

  return (
    <div className="light-ui h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-9 px-2">
            <Link href="/student/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {classInfo?.name || '课堂'}
              </div>
              <div className="text-xs text-slate-500">学生端 · 沉浸式互动</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge variant="success" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              已连接
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <Loader size="sm" className="h-3 w-3" />
              连接中
            </Badge>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ClassroomLayout
          isTeacher={false}
          classId={classId}
          className={classInfo?.name || '互动课堂'}
          currentUser={currentUser}
          participants={allParticipants}
          emotions={emotions}
          messages={messages}
          whiteboardEvents={whiteboardEvents}
          onWhiteboardAction={sendWhiteboardAction}
          isLive={classroomLive}
          startedAt={classInfo?.recentSessions?.find((item) => !item.endedAt)?.startedAt}
          onEmotion={sendEmotion}
          onSendChat={sendChat}
          onRaiseHand={raiseHand}
          handRaisedStudents={allParticipants.filter((participant) => participant.isHandRaised)}
          tutoringId={tutoring?.id}
          classFilesVersion={classFilesVersion}
        />

        <div className="md:hidden px-4 pb-4 pt-0">
          <EmotionBar onEmotion={sendEmotion} />
        </div>
      </div>

      <QuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        quiz={activeQuiz}
        onSubmit={handleSubmitQuiz}
        mode="student"
        participants={allParticipants}
        reviewMode={Boolean(quizResult)}
        studentResult={quizResult}
      />
    </div>
  )
}
