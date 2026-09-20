'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Timer, Users, BrainCircuit, MessageCircle, Hand, ChevronUp, ChevronDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import EmotionBar from './EmotionBar'
import ChatSidebar from './ChatSidebar'
import type { Participant, EmotionType, ChatMessage } from '@eduverse/shared'
import type { WhiteboardEventData } from '@eduverse/shared'
import MediaPanel from './MediaPanel'
import ClassFilesPanel from './ClassFilesPanel'
import SharedWhiteboard from './SharedWhiteboard'
import RecordingsPanel from './RecordingsPanel'

const VirtualClassroom = dynamic(
  () => import('./VirtualClassroom'),
  { ssr: false, loading: () => <div className="w-full aspect-[16/10] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">加载虚拟教室...</div> }
)

interface ClassroomLayoutProps {
  isTeacher: boolean
  classId: string
  className: string
  currentUser: Participant
  participants: Participant[]
  emotions: Record<string, EmotionType>
  messages: ChatMessage[]
  whiteboardEvents: WhiteboardEventData[]
  onWhiteboardAction: (action: 'stroke' | 'clear' | 'undo', payload: unknown) => Promise<boolean>
  isLive?: boolean
  startedAt?: string | Date
  onEmotion: (emotion: EmotionType) => void
  onSendChat: (content: string) => void
  onRaiseHand?: () => Promise<boolean | null>
  onStartQuiz?: () => void
  onToggleHeatMap?: (show: boolean) => void
  onOpenPersonalQueue?: () => void
  showHeatMap?: boolean
  highlightedUserId?: string | null
  handRaisedStudents?: Participant[]
  tutoringId?: string
  /** Bumped when the classroom socket reports that the material list changed. */
  classFilesVersion?: number
  /** Teacher only: announces a fresh upload to everyone else in the room. */
  onClassFilesChanged?: () => Promise<boolean>
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function TeacherToolbar({
  className,
  participants,
  duration,
  isLive,
  onStartQuiz,
}: {
  className: string
  participants: Participant[]
  duration: number
  isLive: boolean
  onStartQuiz?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-b border-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">{className}</h1>
        <Badge variant={isLive ? 'default' : 'secondary'} className="gap-1">
          {isLive ? '● 上课中' : '未开始'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />
          {participants.length} 人
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Timer className="h-3 w-3" />
          {formatDuration(duration)}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {onStartQuiz && (
          <Button onClick={onStartQuiz} className="gap-2">
            <Trophy className="h-4 w-4" />
            发起测验
          </Button>
        )}
      </div>
    </div>
  )
}

function StudentToolbar({
  className,
  participants,
  duration,
  isLive,
  onRaiseHand,
  handRaised,
}: {
  className: string
  participants: Participant[]
  duration: number
  isLive: boolean
  onRaiseHand?: () => void
  handRaised?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-b border-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">{className}</h1>
        <Badge variant={isLive ? 'default' : 'secondary'} className="gap-1">
          {isLive ? '● 上课中' : '未开始'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />
          {participants.length} 人
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Timer className="h-3 w-3" />
          {formatDuration(duration)}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {onRaiseHand && (
          <Button
            variant={handRaised ? 'default' : 'outline'}
            onClick={onRaiseHand}
            className={cn('gap-2', handRaised && 'bg-amber-500 hover:bg-amber-600')}
          >
            <Hand className="h-4 w-4" />
            {handRaised ? '已举手' : '举手'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function ClassroomLayout({
  isTeacher,
  classId,
  className,
  currentUser,
  participants,
  emotions,
  messages,
  whiteboardEvents,
  onWhiteboardAction,
  isLive = true,
  startedAt,
  onEmotion,
  onSendChat,
  onRaiseHand,
  onStartQuiz,
  onToggleHeatMap,
  onOpenPersonalQueue,
  showHeatMap = false,
  highlightedUserId,
  handRaisedStudents = [],
  tutoringId,
  classFilesVersion = 0,
  onClassFilesChanged,
}: ClassroomLayoutProps) {
  const [duration, setDuration] = useState(0)
  const [showChatMobile, setShowChatMobile] = useState(false)
  const [bottomBarExpanded, setBottomBarExpanded] = useState(true)
  const [localHeatMap, setLocalHeatMap] = useState(showHeatMap)
  const [handRaised, setHandRaised] = useState(false)

  useEffect(() => {
    if (!isLive) return
    const update = () => setDuration(startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0)
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [isLive, startedAt])

  useEffect(() => {
    setLocalHeatMap(showHeatMap)
  }, [showHeatMap])

  useEffect(() => {
    setHandRaised(handRaisedStudents.some((p) => p.userId === currentUser.userId))
  }, [handRaisedStudents, currentUser.userId])

  const handleRaiseHand = async () => {
    const confirmed = await onRaiseHand?.()
    if (confirmed !== null && confirmed !== undefined) setHandRaised(confirmed)
  }

  const handleToggleHeatMap = (val?: boolean) => {
    const next = val !== undefined ? val : !localHeatMap
    setLocalHeatMap(next)
    onToggleHeatMap?.(next)
  }

  const studentCount = useMemo(
    () => participants.filter((p) => p.role !== 'teacher').length,
    [participants]
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-50">
      {isTeacher ? (
        <TeacherToolbar
          className={className}
          participants={participants}
          duration={duration}
          isLive={isLive}
          onStartQuiz={onStartQuiz}
        />
      ) : (
        <StudentToolbar
          className={className}
          participants={participants}
          duration={duration}
          isLive={isLive}
          onRaiseHand={handleRaiseHand}
          handRaised={handRaised}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-auto p-4 pb-0">
            <MediaPanel classId={classId} isTeacher={isTeacher} tutoringId={tutoringId} />
            <div className="h-3" />
            <RecordingsPanel classId={classId} isTeacher={isTeacher} />
            <div className="h-3" />
            <ClassFilesPanel classId={classId} isTeacher={isTeacher} version={classFilesVersion} onChanged={onClassFilesChanged} />
            <div className="h-3" />
            <SharedWhiteboard events={whiteboardEvents} isTeacher={isTeacher} onAction={onWhiteboardAction} />
            <div className="h-4" />
            <VirtualClassroom
              title={className}
              participants={participants}
              emotions={emotions}
              currentUserId={currentUser.userId}
              isTeacher={isTeacher}
              highlightedUserId={highlightedUserId}
            />
          </div>

          <div className="px-4 py-3">
            {!bottomBarExpanded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBottomBarExpanded(true)}
                className="w-full justify-center text-slate-500 mb-2"
              >
                <ChevronUp className="h-4 w-4 mr-1" />
                展开{isTeacher ? '工具栏' : '情感反馈'}
              </Button>
            )}

            {bottomBarExpanded && (
              <div className="space-y-2">
                {isTeacher ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-primary" />
                        教师工具
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant={localHeatMap ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleHeatMap()}
                          className="gap-1"
                        >
                          {localHeatMap ? '关闭热力图' : '显示热力图'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onOpenPersonalQueue}
                          className="gap-1"
                        >
                          <Users className="h-3.5 w-3.5" />
                          辅导队列 ({handRaisedStudents.length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setBottomBarExpanded(false)}
                        >
                          <div>
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <EmotionBar onEmotion={onEmotion} />
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBottomBarExpanded(false)}
                        className="text-slate-500"
                      >
                        <ChevronDown className="h-4 w-4 mr-1" />
                        收起情感反馈
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowChatMobile(true)}
              aria-label="打开课堂聊天"
              className="md:hidden fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
            >
              <MessageCircle className="h-5 w-5" />
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-xs flex items-center justify-center">
                  {messages.length > 9 ? '9+' : messages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <ChatSidebar
          messages={messages}
          onSend={onSendChat}
          currentUser={currentUser}
          className="hidden md:flex"
          mobileOpen={showChatMobile}
          onMobileClose={() => setShowChatMobile(false)}
        />
      </div>
    </div>
  )
}
