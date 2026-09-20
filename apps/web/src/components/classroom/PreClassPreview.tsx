'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ClientPreviewResponse as PreviewResponse } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  Pause,
  RotateCcw,
  MessageCircle,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'

interface PreClassPreviewProps {
  preview: PreviewResponse
  classId?: string
}

export default function PreClassPreview({ preview, classId }: PreClassPreviewProps) {
  const router = useRouter()

  const paragraphs = useMemo(
    () =>
      preview.script
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean),
    [preview.script]
  )

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentParagraph, setCurrentParagraph] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalChars = useMemo(
    () => paragraphs.reduce((sum, p) => sum + p.length, 0),
    [paragraphs]
  )
  const typedTotalChars = useMemo(() => {
    let sum = 0
    for (let i = 0; i < currentParagraph; i++) sum += paragraphs[i]?.length || 0
    return sum + typedChars
  }, [currentParagraph, typedChars, paragraphs])

  const progress = totalChars > 0 ? (typedTotalChars / totalChars) * 100 : 0
  const currentParaLength = paragraphs[currentParagraph]?.length || 0

  const estimatedRemaining = useMemo(() => {
    const remainingChars = totalChars - typedTotalChars
    const seconds = Math.ceil(remainingChars / (1000 / 30) / 5)
    if (seconds < 60) return `约 ${seconds} 秒`
    return `约 ${Math.ceil(seconds / 60)} 分钟`
  }, [totalChars, typedTotalChars])

  const currentKeyPoint = preview.keyPoints[Math.min(currentParagraph, preview.keyPoints.length - 1)]
  const currentDifficulty = preview.difficulties[Math.min(currentParagraph, preview.difficulties.length - 1)]
  const currentQuestion = preview.previewQuestions[Math.min(currentParagraph, preview.previewQuestions.length - 1)]

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setTypedChars((prev) => {
          if (prev < currentParaLength) {
            return prev + 1
          }
          if (currentParagraph < paragraphs.length - 1) {
            setCurrentParagraph((cp) => cp + 1)
            return 0
          }
          setIsPlaying(false)
          if (intervalRef.current) clearInterval(intervalRef.current)
          return prev
        })
      }, 30)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, currentParagraph, currentParaLength, paragraphs.length])

  useEffect(() => {
    if (isPlaying && typedChars >= currentParaLength && currentParagraph >= paragraphs.length - 1) {
      setIsPlaying(false)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [typedChars, currentParaLength, currentParagraph, paragraphs.length, isPlaying])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setIsPlaying(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    setCurrentParagraph(0)
    setTypedChars(0)
  }

  const handleAskAI = () => {
    router.push(`/student/tutor?context=preclass&classId=${classId || ''}`)
  }

  const isFinished = !isPlaying && currentParagraph >= paragraphs.length - 1 && typedChars >= currentParaLength && totalChars > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
      <div className="lg:col-span-7 space-y-4">
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <span className="text-2xl">📖</span>
                课前预习播放器
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                剩余 {estimatedRemaining}
              </Badge>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>进度 {Math.round(progress)}%</span>
              <span>
                段落 {Math.min(currentParagraph + 1, paragraphs.length)} / {paragraphs.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="py-6">
            <div className="space-y-5 mb-6">
              {paragraphs.map((para, idx) => {
                const isCurrent = idx === currentParagraph
                const isPast = idx < currentParagraph
                const displayText = isCurrent
                  ? para.slice(0, typedChars)
                  : isPast
                  ? para
                  : ''

                return (
                  <div
                    key={idx}
                    className={`transition-all duration-300 ${
                      isCurrent
                        ? 'opacity-100 scale-[1.01]'
                        : isPast
                        ? 'opacity-60'
                        : 'opacity-30'
                    }`}
                  >
                    {isCurrent && (
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="default" className="text-xs">
                          正在播放
                        </Badge>
                      </div>
                    )}
                    <p
                      className={`leading-relaxed whitespace-pre-wrap ${
                        isCurrent
                          ? 'text-xl font-medium text-foreground'
                          : 'text-base text-muted-foreground'
                      }`}
                    >
                      {displayText}
                      {isCurrent && isPlaying && (
                        <span className="inline-block w-0.5 h-6 bg-primary ml-0.5 animate-pulse align-middle" />
                      )}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-center gap-3 pt-4 border-t">
              <Button variant="outline" size="lg" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重置
              </Button>
              <Button size="lg" onClick={handlePlayPause} disabled={isFinished}>
                {isPlaying ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    暂停
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {isFinished ? '已完成' : progress > 0 ? '继续' : '开始播放'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isFinished && (
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="py-8 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-bold mb-2">太棒了！预习完成</h3>
              <p className="text-muted-foreground mb-4">
                你已经完成了本节课的预习，带着问题去课堂会更有收获哦！
              </p>
              <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600" onClick={handleAskAI}>
                <MessageCircle className="mr-2 h-4 w-4" />
                我有问题，问 AI 学伴 💬
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:col-span-3 space-y-4">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              关键点 {currentParagraph + 1}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentKeyPoint ? (
              <div className="animate-fade-in">
                <div className="text-4xl text-center mb-3">💡</div>
                <p className="font-medium text-center leading-relaxed">
                  {currentKeyPoint}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">暂无</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              注意难点
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentDifficulty ? (
              <Badge variant="warning" className="animate-fade-in">
                ⚠️ {currentDifficulty}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">暂无</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-purple-500" />
              思考问题
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentQuestion ? (
              <p className="text-sm leading-relaxed text-muted-foreground animate-fade-in">
                💭 {currentQuestion}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">暂无</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">学完了但有疑问？</p>
            <Button variant="outline" size="sm" onClick={handleAskAI}>
              <MessageCircle className="mr-2 h-4 w-4" />
              问 AI 学伴
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
