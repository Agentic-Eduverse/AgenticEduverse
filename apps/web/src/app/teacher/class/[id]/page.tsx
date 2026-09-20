'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader } from '@/components/ui/loader'
import { ArrowLeft, AlertCircle, UserPlus, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useClassroomSocket } from '@/components/classroom/useClassroomSocket'
import ClassroomLayout from '@/components/classroom/ClassroomLayout'
import QuizModal from '@/components/classroom/QuizModal'
import HeatMap from '@/components/teacher/HeatMap'
import PersonalClassQueue, {
  QueueStudent,
} from '@/components/teacher/PersonalClassQueue'
import type { Participant, QuizResponse } from '@eduverse/shared'
import ParentInviteDialog from '@/components/teacher/ParentInviteDialog'
import { api, type ClientClass } from '@/lib/api-client'
import QuizManagerDialog from '@/components/teacher/QuizManagerDialog'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

export default function TeacherClassPage() {
  const { t } = useI18n()
  const params = useParams()
  const classId = params?.id as string
  const { data: session } = useSession()

  const {
    connected,
    classroomLive,
    participants: socketParticipants,
    emotions,
    recentEmotions,
    activeQuiz: socketActiveQuiz,
    messages,
    quizScores,
    joinClassroom,
    sendEmotion,
    sendChat,
    resolveHand,
    tutoring,
    startTutoring,
    endTutoring,
    submitAnswer,
    startQuiz,
    endQuiz,
    endClassroom,
    whiteboardEvents,
    sendWhiteboardAction,
    classFilesVersion,
    notifyClassFilesChanged,
  } = useClassroomSocket()

  const [quizOpen, setQuizOpen] = useState(false)
  const [activeQuiz, setActiveQuiz] = useState<QuizResponse | null>(null)
  const [showHeatMap, setShowHeatMap] = useState(true)
  const [showQueueDrawer, setShowQueueDrawer] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [quizManagerOpen, setQuizManagerOpen] = useState(false)
  const [classStudents, setClassStudents] = useState<Participant[]>([])
  const [classInfo, setClassInfo] = useState<ClientClass | null>(null)
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(null)
  const [queueStudents, setQueueStudents] = useState<QueueStudent[]>([])

  const allParticipants = useMemo<Participant[]>(() => {
    if (socketParticipants && socketParticipants.length > 0) {
      return socketParticipants
    }
    return []
  }, [socketParticipants])

  const currentUser = useMemo<Participant>(() => ({
    userId: session?.user?.id || '',
    name: session?.user?.name || t('classroom.teacherFallback'),
    role: 'teacher',
  }), [session, t])

  useEffect(() => {
    if (session?.user?.id) joinClassroom(classId, session.user.id)
  }, [joinClassroom, classId, session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    api.classes.get(classId)
      .then((info) => { setClassInfo(info); setClassStudents((info.students || []).map((student) => ({ userId: student.id, name: student.name, role: 'student' }))) })
      .catch(() => setClassStudents([]))
  }, [classId, session?.user?.id])

  useEffect(() => {
    if (socketActiveQuiz) {
      setActiveQuiz(socketActiveQuiz)
      setQuizOpen(true)
    } else {
      setActiveQuiz(null)
      setQuizOpen(false)
    }
  }, [socketActiveQuiz])

  useEffect(() => {
    const raised = socketParticipants.filter((participant) => participant.role === 'student' && participant.isHandRaised)
    setQueueStudents((current) => {
      const next: QueueStudent[] = raised.map((participant) => ({
        id: participant.userId,
        participant,
        raiseTime: current.find((item) => item.participant.userId === participant.userId)?.raiseTime || Date.now(),
        status: 'waiting' as const,
      }))
      if (tutoring) {
        const participant = socketParticipants.find((item) => item.userId === tutoring.studentId) || classStudents.find((item) => item.userId === tutoring.studentId)
        if (participant) {
          const withoutStudent = next.filter((item) => item.participant.userId !== tutoring.studentId)
          withoutStudent.unshift({ id: participant.userId, participant, raiseTime: new Date(tutoring.startedAt).getTime(), status: 'in-call' })
          return withoutStudent
        }
      }
      return next
    })
  }, [socketParticipants, tutoring, classStudents])

  const handleStartQuiz = () => setQuizManagerOpen(true)

  const startSelectedQuiz = async (quizId: string) => {
    const started = await startQuiz(quizId)
    if (started) toast.success(t('classroom.quizStarted'))
    return started
  }

  const handleEndQuiz = async () => {
    if (await endQuiz()) toast.info(t('classroom.quizEnded'))
    else toast.error(t('classroom.quizEndFailed'))
  }

  const handleEndClassroom = async () => {
    if (await endClassroom()) {
      setClassInfo((current) => current ? { ...current, isLive: false } : current)
      toast.success(t('classroom.classEnded'))
    } else {
      toast.error(t('classroom.classEndFailed'))
    }
  }

  const handleToggleHeatMap = (show: boolean) => {
    setShowHeatMap(show)
  }

  const handleRemoveStudent = async (queueId: string) => {
    const qs = queueStudents.find((s) => s.id === queueId)
    if (!qs || !(await resolveHand(qs.participant.userId))) {
      toast.error(t('classroom.handUpdateFailed'))
      return
    }
    setHighlightedUserId(null)
    toast.success(t('classroom.handHandled'))
  }

  const handleConnectStudent = async (queueId: string) => {
    const item = queueStudents.find((student) => student.id === queueId)
    if (!item || !(await startTutoring(item.participant.userId))) {
      toast.error(t('classroom.tutoringStartFailed'))
      return
    }
    setHighlightedUserId(item.participant.userId)
    toast.success(t('classroom.tutoringStarted'))
  }

  const handleDisconnectStudent = async () => {
    if (!(await endTutoring())) {
      toast.error(t('classroom.tutoringEndFailed'))
      return
    }
    setHighlightedUserId(null)
    toast.success(t('classroom.tutoringEnded'))
  }

  return (
    <div className="light-ui h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-9 px-2">
            <Link href="/teacher/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('classroom.back')}
            </Link>
          </Button>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {classInfo?.name || t('classroom.classFallback')}
            </div>
            <div className="text-xs text-slate-500">{t('classroom.teacherPortal')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="destructive" size="sm" onClick={handleEndClassroom} disabled={!classroomLive}>
            <Square className="mr-1 h-3.5 w-3.5" />{t('classroom.endClass')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" />
            {t('classroom.inviteParent')}
          </Button>
          {connected ? (
            <Badge variant="success" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('classroom.connected')}
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <Loader size="sm" className="h-3 w-3" />
              {t('classroom.connecting')}
            </Badge>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <div
          className={`flex-1 overflow-hidden transition-all ${
            showQueueDrawer ? 'md:mr-96' : ''
          }`}
        >
          <ClassroomLayout
            isTeacher={true}
            classId={classId}
            className={classInfo?.name || t('classroom.interactiveClass')}
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
            onStartQuiz={handleStartQuiz}
            onToggleHeatMap={handleToggleHeatMap}
            onOpenPersonalQueue={() => setShowQueueDrawer((v) => !v)}
            showHeatMap={showHeatMap}
            highlightedUserId={highlightedUserId}
            handRaisedStudents={queueStudents
              .filter((s) => s.status === 'waiting')
              .map((s) => s.participant)}
            tutoringId={tutoring?.id}
            classFilesVersion={classFilesVersion}
            onClassFilesChanged={notifyClassFilesChanged}
          />

          {showHeatMap && (
            <div className="p-4 pt-0">
              <HeatMap
                participants={allParticipants}
                recentEmotions={recentEmotions}
              />
            </div>
          )}
        </div>

        {showQueueDrawer && (
          <aside className="hidden md:flex fixed right-0 top-14 bottom-0 w-96 border-l border-slate-200 bg-white overflow-y-auto z-20 p-4">
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">{t('classroom.tutoringManagement')}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQueueDrawer(false)}
                  className="text-slate-500"
                >
                  收起
                </Button>
              </div>
              <PersonalClassQueue
                students={queueStudents}
                onConnect={handleConnectStudent}
                onDisconnect={handleDisconnectStudent}
                onRemove={handleRemoveStudent}
              />
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">{t('classroom.tutoringHint')}</div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      {t('classroom.tutoringHintBody')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
      <ParentInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        classId={classId}
        students={classStudents}
      />
      <QuizManagerDialog
        open={quizManagerOpen}
        onOpenChange={setQuizManagerOpen}
        classId={classId}
        onStart={startSelectedQuiz}
      />

      {showQueueDrawer && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setShowQueueDrawer(false)}>
          <div
            className="absolute inset-y-0 right-0 w-[85%] max-w-sm bg-white overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">{t('classroom.tutoringManagement')}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQueueDrawer(false)}
                  className="text-slate-500"
                >
                  {t('classroom.close')}
                </Button>
              </div>
              <PersonalClassQueue
                students={queueStudents}
                onConnect={handleConnectStudent}
                onDisconnect={handleDisconnectStudent}
                onRemove={handleRemoveStudent}
              />
            </div>
          </div>
        </div>
      )}

      <QuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        quiz={activeQuiz}
        onSubmit={(answers) => submitAnswer(activeQuiz?.id || '', answers)}
        onEndEarly={handleEndQuiz}
        mode="teacher"
        participants={allParticipants}
        scores={quizScores}
      />
    </div>
  )
}
