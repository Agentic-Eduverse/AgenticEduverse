'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClientRolePlayRole as RolePlayRole } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, RotateCcw, Lock, Unlock } from 'lucide-react'

export interface RolePlayCardProps {
  role: RolePlayRole
  showSecret?: boolean
  isTeacherView?: boolean
  studentName?: string
}

const colorMap: Record<string, { border: string; bg: string; text: string; gradient: string }> = {
  red: {
    border: 'border-red-400',
    bg: 'bg-red-50',
    text: 'text-red-700',
    gradient: 'from-red-400 to-rose-500',
  },
  blue: {
    border: 'border-blue-400',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    gradient: 'from-blue-400 to-indigo-500',
  },
  green: {
    border: 'border-green-400',
    bg: 'bg-green-50',
    text: 'text-green-700',
    gradient: 'from-green-400 to-emerald-500',
  },
  amber: {
    border: 'border-amber-400',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    gradient: 'from-amber-400 to-orange-500',
  },
  purple: {
    border: 'border-purple-400',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    gradient: 'from-purple-400 to-pink-500',
  },
  cyan: {
    border: 'border-cyan-400',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    gradient: 'from-cyan-400 to-sky-500',
  },
}

export default function RolePlayCard({
  role,
  showSecret = false,
  isTeacherView = false,
  studentName,
}: RolePlayCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [secretRevealed, setSecretRevealed] = useState(showSecret)

  const colors = colorMap[role.personalityColor || 'blue'] || colorMap.blue

  return (
    <div className="w-full perspective-1000">
      <div
        className={cn(
          'relative w-full transition-transform duration-700 preserve-3d cursor-pointer',
          flipped && 'rotate-y-180'
        )}
        style={{ minHeight: '320px' }}
      >
        <div
          className={cn(
            'absolute inset-0 backface-hidden rounded-xl border-2 shadow-lg overflow-hidden',
            colors.border,
            colors.bg
          )}
        >
          <div className={cn('h-24 bg-gradient-to-r', colors.gradient, 'relative')}>
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute bottom-2 left-4 right-4 flex items-end justify-between">
              <span className="text-5xl drop-shadow-lg">{role.avatar || '🎭'}</span>
              {studentName && (
                <Badge variant="outline" className="bg-white/90 text-xs">
                  扮演: {studentName}
                </Badge>
              )}
            </div>
          </div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className={cn('text-xl', colors.text)}>{role.name}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setFlipped(true)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                详情
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">身份：</span>
                <span className="line-clamp-2">{role.background}</span>
              </div>
              {role.secretMission && (
                <div className="mt-3 pt-3 border-t">
                  {secretRevealed ? (
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Unlock className="h-3.5 w-3.5 text-amber-600" />
                        <span className="font-medium text-amber-700 text-xs">秘密任务（已揭示）</span>
                      </div>
                      <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 border border-amber-200">
                        {role.secretMission}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-muted-foreground text-xs">秘密任务（隐藏）</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSecretRevealed(true)
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          揭示
                        </Button>
                      </div>
                      <div className="mt-1 h-8 bg-muted/50 rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground">
                        🔒 点击揭示查看你的专属任务
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </div>

        <div
          className={cn(
            'absolute inset-0 backface-hidden rounded-xl border-2 shadow-lg overflow-hidden rotate-y-180',
            colors.border,
            'bg-white'
          )}
        >
          <div className={cn('h-1.5 bg-gradient-to-r', colors.gradient)} />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className={cn('text-lg', colors.text)}>{role.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">角色详细资料</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setFlipped(false)
                }}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                返回
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <Badge variant="secondary" className="mb-1.5">背景故事</Badge>
              <p className="text-muted-foreground leading-relaxed">{role.background}</p>
            </div>
            <div>
              <Badge variant="default" className="mb-1.5">角色目标</Badge>
              <p className="text-muted-foreground leading-relaxed">{role.goal}</p>
            </div>
            {role.secretMission && (secretRevealed || isTeacherView) && (
              <div>
                <Badge variant="warning" className="mb-1.5">
                  {isTeacherView && !secretRevealed ? <EyeOff className="h-3 w-3 mr-1" /> : null}
                  秘密任务
                </Badge>
                <p className="text-amber-800 leading-relaxed bg-amber-50 rounded p-2 border border-amber-200">
                  {role.secretMission}
                </p>
              </div>
            )}
          </CardContent>
        </div>
      </div>
    </div>
  )
}
