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

export default function TeacherClassPage() {
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
    name: session?.user?.name || '教师',
    role: 'teacher',
  }), [session])

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
    if (started) toast.success('已向全班发起测验')
    return started
  }

  const handleEndQuiz = async () => {
    if (await endQuiz()) toast.info('测验已结束')
    else toast.error('结束测验失败，请重试')
  }

  const handleEndClassroom = async () => {
    if (await endClassroom()) {
      setClassInfo((current) => current ? { ...current, isLive: false } : current)
      toast.success('本节课堂已结束，出勤记录已结算')
    } else {
      toast.error('结束课堂失败；如正在录制，请先停止并等待文件处理完成')
    }
  }

  const handleToggleHeatMap = (show: boolean) => {
    setShowHeatMap(show)
  }

  const handleRemoveStudent = async (queueId: string) => {
    const qs = queueStudents.find((s) => s.id === queueId)
    if (!qs || !(await resolveHand(qs.participant.userId))) {
      toast.error('更新举手队列失败，请重试')
      return
    }
    setHighlightedUserId(null)
    toast.success('已处理该次举手')
  }

  const handleConnectStudent = async (queueId: string) => {
    const item = queueStudents.find((student) => student.id === queueId)
    if (!item || !(await startTutoring(item.participant.userId))) {
      toast.error('开始私密辅导失败，请确认学生仍在线')
      return
    }
    setHighlightedUserId(item.participant.userId)
    toast.success('私密辅导会话已建立，可连接独立音视频房间')
  }

  const handleDisconnectStudent = async () => {
    if (!(await endTutoring())) {
      toast.error('结束私密辅导失败，请重试')
      return
    }
    setHighlightedUserId(null)
    toast.success('私密辅导已结束，双方已返回主课堂')
  }

  return (
    <div className="light-ui h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-9 px-2">
            <Link href="/teacher/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Link>
          </Button>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {classInfo?.name || '课堂'}
            </div>
            <div className="text-xs text-slate-500">教师端</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleEndClassroom} disabled={!classroomLive}>
            <Square className="mr-1 h-3.5 w-3.5" />结束课堂
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" />
            邀请家长
          </Button>
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

      <div className="flex-1 overflow-hidden flex">
        <div
          className={`flex-1 overflow-hidden transition-all ${
            showQueueDrawer ? 'md:mr-96' : ''
          }`}
        >
          <ClassroomLayout
            isTeacher={true}
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
                <h2 className="font-semibold text-slate-800">辅导管理</h2>
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
                    <div className="font-medium">辅导提示</div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      开始辅导后，教师与该学生会获得独立受限房间；主课堂录制不会录入辅导内容。
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
                <h2 className="font-semibold text-slate-800">辅导管理</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQueueDrawer(false)}
                  className="text-slate-500"
                >
                  关闭
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
