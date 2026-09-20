'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Participant, EmotionType } from '@eduverse/shared'
import { EMOTION_META } from '@/lib/emotion-meta'

interface RecentEmotion {
  userId: string
  emotion: EmotionType
  timestamp: number
}

interface HeatMapProps {
  participants: Participant[]
  recentEmotions: RecentEmotion[]
}

const EMOTION_COLORS: Record<string, string> = {
  happy: 'bg-emerald-400/30',
  confused: 'bg-red-400/30',
  repeat: 'bg-amber-400/30',
  idea: 'bg-blue-400/30',
}

const EMOTION_DOT: Record<string, string> = {
  happy: 'bg-emerald-500',
  confused: 'bg-red-500',
  repeat: 'bg-amber-500',
  idea: 'bg-blue-500',
}

function getEmotionForUser(
  userId: string,
  recentEmotions: RecentEmotion[]
): { emotion: EmotionType | null; intensity: number } {
  const now = Date.now()
  const userEmotions = recentEmotions
    .filter((e) => e.userId === userId && now - e.timestamp < 30000)
    .sort((a, b) => b.timestamp - a.timestamp)

  if (userEmotions.length === 0) {
    return { emotion: null, intensity: 0 }
  }

  const latest = userEmotions[0]
  const age = now - latest.timestamp
  const intensity = Math.max(0.3, 1 - age / 30000)
  return { emotion: latest.emotion, intensity }
}

export default function HeatMap({ participants, recentEmotions }: HeatMapProps) {
  const [expanded, setExpanded] = useState(true)

  const students = useMemo(
    () => participants.filter((p) => p.role !== 'teacher'),
    [participants]
  )

  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(students.length * 1.5))))
  const rows = Math.ceil(students.length / cols)

  const emotionStats = useMemo(() => {
    const stats: Record<string, number> = {
      happy: 0,
      confused: 0,
      repeat: 0,
      idea: 0,
      neutral: 0,
    }
    students.forEach((s) => {
      const { emotion } = getEmotionForUser(s.userId, recentEmotions)
      if (emotion && stats[emotion] !== undefined) {
        stats[emotion]++
      } else {
        stats.neutral++
      }
    })
    return stats
  }, [students, recentEmotions])

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400" />
            情感热力图
            <span className="text-xs font-normal text-slate-500">（近30秒）</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((e) => !e)}
          >
            <div>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <div
            className="grid gap-2 mb-4"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, 1fr))`,
            }}
          >
            {students.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-slate-400">
                暂无学生加入
              </div>
            ) : (
              students.map((student) => {
                const { emotion, intensity } = getEmotionForUser(student.userId, recentEmotions)
                const bgClass = emotion ? EMOTION_COLORS[emotion] : 'bg-slate-200/40'
                const dotClass = emotion ? EMOTION_DOT[emotion] : 'bg-slate-400'

                return (
                  <div
                    key={student.userId}
                    className={cn(
                      'relative flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200/50 transition-all',
                      bgClass
                    )}
                    style={{ opacity: 0.5 + intensity * 0.5 }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn('h-2 w-2 rounded-full', dotClass)} />
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[80px]">
                        {student.name}
                      </span>
                    </div>
                    {emotion && (
                      <span className="text-lg">
                        {(EMOTION_META as Record<string, { emoji: string }>)[emotion]?.emoji}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-medium text-slate-500 mb-2">统计</div>
            <div className="grid grid-cols-5 gap-2">
              {(['happy', 'confused', 'repeat', 'idea', 'neutral'] as const).map((k) => {
                const emoji =
                  k === 'neutral' ? '😐' : (EMOTION_META as Record<string, { emoji: string }>)[k]?.emoji
                const label =
                  k === 'neutral'
                    ? '中性'
                    : (EMOTION_META as Record<string, { label: string }>)[k]?.label || k
                const dotClass =
                  k === 'neutral' ? 'bg-slate-400' : EMOTION_DOT[k]
                return (
                  <div
                    key={k}
                    className="flex flex-col items-center gap-1 rounded-md bg-slate-50 p-2"
                  >
                    <span className="text-xs">{emoji}</span>
                    <div className="flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
                      <span className="text-xs text-slate-600">{label}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      {emotionStats[k]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
