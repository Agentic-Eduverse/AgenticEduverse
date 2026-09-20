'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PhoneOff, UserCheck, Clock, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Participant } from '@eduverse/shared'

export type QueueStatus = 'waiting' | 'in-call'

export interface QueueStudent {
  id: string
  participant: Participant
  raiseTime: Date | number
  status: QueueStatus
}

interface PersonalClassQueueProps {
  students: QueueStudent[]
  onConnect?: (studentId: string) => void
  onDisconnect?: (studentId: string) => void
  onRemove?: (studentId: string) => void
}

function formatWaitTime(raiseTime: Date | number): string {
  const start = typeof raiseTime === 'number' ? raiseTime : new Date(raiseTime).getTime()
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000))
  if (diff < 60) return `${diff}秒`
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}分${s}秒`
}

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

export default function PersonalClassQueue({
  students,
  onConnect,
  onDisconnect,
  onRemove,
}: PersonalClassQueueProps) {
  const waitingCount = students.filter((s) => s.status === 'waiting').length
  const inCallCount = students.filter((s) => s.status === 'in-call').length

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            举手学生队列
          </CardTitle>
          <div className="flex items-center gap-2">
            {waitingCount > 0 && (
              <Badge variant="warning" className="gap-1">
                <Clock className="h-3 w-3" />
                等待 {waitingCount}
              </Badge>
            )}
            {inCallCount > 0 && <Badge variant="success">辅导中 {inCallCount}</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {students.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            <Users className="h-10 w-10 mx-auto mb-2 text-slate-300" />
            暂无学生举手
          </div>
        ) : (
          <div className="space-y-2">
            {students.map((student) => {
              const isWaiting = student.status === 'waiting'
              const isInCall = student.status === 'in-call'
              return (
                <div
                  key={student.id}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-lg border transition-all',
                    isInCall ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200' : isWaiting
                      ? 'border-slate-200 bg-white hover:border-slate-300'
                      : 'border-slate-200 bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback
                          className={cn(
                            isInCall ? 'bg-emerald-600 text-white' : isWaiting && 'bg-primary/10 text-primary'
                          )}
                        >
                          {getInitials(student.participant.name)}
                        </AvatarFallback>
                      </Avatar>
                      {isWaiting && !isInCall && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-amber-400 border-2 border-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 truncate">
                          {student.participant.name}
                        </span>
                        <Badge
                          variant={isInCall ? 'success' : isWaiting ? 'warning' : 'secondary'}
                          className="shrink-0"
                        >
                          {isInCall ? '私密辅导中' : '等待中'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>
                          {isInCall ? '已开始' : '等待'} {formatWaitTime(student.raiseTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isWaiting && <Button size="sm" onClick={() => onConnect?.(student.id)} className="gap-1"><UserCheck className="h-4 w-4" />开始辅导</Button>}
                    {isInCall && <Button size="sm" variant="destructive" onClick={() => onDisconnect?.(student.id)} className="gap-1"><PhoneOff className="h-4 w-4" />结束辅导</Button>}
                    {!isInCall && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-slate-700"
                      onClick={() => onRemove?.(student.id)}
                    >
                      <UserCheck className="h-4 w-4" />处理完成
                    </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
