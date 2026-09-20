'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Timer, X, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuizResponse, QuizQuestion, Participant, QuizScoreEntry } from '@eduverse/shared'

interface QuizModalProps {
  open: boolean
  onClose: () => void
  quiz: QuizResponse | null
  onSubmit?: (answers: AnswerSubmission[]) => void | boolean | Promise<void | boolean>
  onEndEarly?: () => void
  mode: 'teacher' | 'student'
  participants?: Participant[]
  scores?: QuizScoreEntry[]
  reviewMode?: boolean
  studentResult?: { score: number | null; rawScore: number | null; totalPoints: number | null; correctCount: number | null } | null
}

interface ParticipantScore {
  userId: string
  name: string
  score: number
  answered: boolean
}

interface AnswerSubmission {
  questionId: string
  selectedOptionIds: string[]
  textAnswer?: string
}

export default function QuizModal({
  open,
  onClose,
  quiz,
  onSubmit,
  onEndEarly,
  mode,
  participants = [],
  scores = [],
  reviewMode = false,
  studentResult = null,
}: QuizModalProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerSubmission>>({})
  const [timeLeft, setTimeLeft] = useState(60)
  const [elapsed, setElapsed] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const answersRef = useRef<Record<string, AnswerSubmission>>({})
  const submittedRef = useRef(false)
  const handleSubmitRef = useRef<() => Promise<void>>(async () => undefined)

  const rawQuestions: QuizQuestion[] = useMemo(() => {
    if (!quiz) return []
    return (quiz.questions || []) as QuizQuestion[]
  }, [quiz])

  const totalQuestions = rawQuestions.length
  const currentQ = rawQuestions[currentPage]

  useEffect(() => {
    if (!open || mode !== 'student' || showResults || submitted) return
    const limit = quiz?.timeLimitSeconds || 60
    const startedAt = quiz?.startedAt ? new Date(quiz.startedAt).getTime() : Date.now()
    const initialRemaining = Math.max(0, Math.ceil((startedAt + limit * 1000 - Date.now()) / 1000))
    setTimeLeft(initialRemaining)
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer)
          window.setTimeout(() => handleSubmitRef.current(), 0)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [open, mode, showResults, submitted, quiz])

  useEffect(() => {
    if (!open || mode !== 'teacher') return
    const update = () => {
      const startedAt = quiz?.startedAt ? new Date(quiz.startedAt).getTime() : Date.now()
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [open, mode, quiz?.startedAt])

  useEffect(() => {
    if (open) {
      setCurrentPage(0)
      setAnswers({})
      answersRef.current = {}
      setShowResults(reviewMode)
      setElapsed(0)
      setSubmitted(false)
      submittedRef.current = false
    }
  }, [open, quiz, reviewMode])

  const setAnswer = (questionId: string, answer: AnswerSubmission) => {
    setAnswers((previous) => {
      const next = { ...previous, [questionId]: answer }
      answersRef.current = next
      return next
    })
  }

  const handleSelect = (question: QuizQuestion, optionId: string) => {
    if (submitted || mode !== 'student') return
    const selected = answersRef.current[question.id]?.selectedOptionIds || []
    const next = question.type === 'multiple_choice'
      ? selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]
      : [optionId]
    setAnswer(question.id, { questionId: question.id, selectedOptionIds: next })
  }

  const handleTextAnswer = (questionId: string, textAnswer: string) => {
    if (submitted || mode !== 'student') return
    setAnswer(questionId, { questionId, selectedOptionIds: [], textAnswer })
  }

  const handleSubmit = async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    if (mode === 'student') {
      const submissions = Object.values(answersRef.current).filter((answer) =>
        Boolean(answer.textAnswer?.trim()) || Boolean(answer.selectedOptionIds.length)
      )
      try {
        const accepted = await onSubmit?.(submissions)
        if (accepted === false) {
          submittedRef.current = false
          setSubmitted(false)
          return
        }
      } catch {
        submittedRef.current = false
        setSubmitted(false)
        return
      }
    }
    setShowResults(true)
  }
  handleSubmitRef.current = handleSubmit

  const answeredCount = useMemo(() => {
    if (mode === 'teacher') return scores.length
    return 0
  }, [mode, scores])

  const leaderboard: ParticipantScore[] = useMemo(() => {
    const students = participants.filter((p) => p.role !== 'teacher')
    return scores
      .map((score) => ({
        userId: score.userId,
        name: students.find((student) => student.userId === score.userId)?.name || score.userId,
        score: score.score,
        answered: true,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [participants, scores])

  if (!quiz) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="light-ui max-w-2xl bg-white text-slate-900">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              {quiz.title || '实时测验'}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {showResults ? (
          <div className="space-y-6 py-4">
            {mode === 'student' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-800">
                {studentResult ? <><p className="text-sm">你的成绩</p><p className="mt-1 text-4xl font-bold">{studentResult.score ?? 0} 分</p>{studentResult.rawScore !== null && studentResult.totalPoints !== null && <p className="mt-2 text-sm">原始得分 {studentResult.rawScore} / {studentResult.totalPoints} · 答对 {studentResult.correctCount ?? 0} 题</p>}</> : '答案已提交，等待教师结束测验后公布结果。'}
              </div>
            )}

            {mode === 'teacher' && <div>
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                排行榜 Top 5
              </h3>
              <div className="space-y-2">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.userId}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      idx === 0 && 'border-amber-300 bg-amber-50',
                      idx === 1 && 'border-slate-300 bg-slate-50',
                      idx === 2 && 'border-orange-300 bg-orange-50',
                      idx > 2 && 'border-slate-200 bg-white'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold',
                          idx === 0 && 'bg-amber-400 text-white',
                          idx === 1 && 'bg-slate-400 text-white',
                          idx === 2 && 'bg-orange-400 text-white',
                          idx > 2 && 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-medium text-sm">{entry.name}</div>
                        <div className="text-xs text-slate-500">
                          {entry.answered ? '已作答' : '未作答'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={entry.score >= 60 ? 'success' : 'secondary'}>
                      {entry.score} 分
                    </Badge>
                  </div>
                ))}
              </div>
            </div>}

            {mode === 'student' && studentResult && <div className="max-h-80 space-y-3 overflow-y-auto">
              {rawQuestions.map((question, index) => <div key={question.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-medium text-slate-900">{index + 1}. {question.text}</p>
                <p className="mt-2 text-sm text-emerald-800">正确答案：{Array.isArray(question.correctAnswer) ? question.correctAnswer.map((id) => question.options?.find((option) => option.id === id)?.text || id).join('、') : question.options?.find((option) => option.id === question.correctAnswer)?.text || question.correctAnswer || '未设置'}</p>
                {question.explanation && <p className="mt-1 text-sm text-slate-600">解析：{question.explanation}</p>}
              </div>)}
            </div>}

            <DialogFooter>
              {mode === 'teacher' && onEndEarly && (
                <Button variant="destructive" onClick={onEndEarly}>结束测验</Button>
              )}
              <Button onClick={onClose}>关闭</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {mode === 'student' ? (
              <>
                <div className="flex items-center justify-between mb-4 px-1">
                  <Badge variant="outline" className="gap-1">
                    {currentPage + 1} / {totalQuestions}
                  </Badge>
                  <div
                    className={cn(
                      'flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium',
                      timeLeft <= 10
                        ? 'bg-red-100 text-red-700'
                        : timeLeft <= 30
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    )}
                  >
                    <Timer className="h-3.5 w-3.5" />
                    剩余 {timeLeft}s
                  </div>
                </div>

                <div className="space-y-4 mb-4">
                    {currentQ && (
                    <>
                      <div className="text-lg font-semibold text-slate-800">
                        {currentPage + 1}. {currentQ.text}
                      </div>
                      {currentQ.type === 'short_answer' ? (
                        <textarea
                          value={answers[currentQ.id]?.textAnswer || ''}
                          onChange={(event) => handleTextAnswer(currentQ.id, event.target.value)}
                          disabled={submitted}
                          className="min-h-40 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          placeholder="输入你的答案"
                        />
                      ) : <div className="space-y-2">
                        {(currentQ.options || []).map((option, idx) => {
                          const selected = answers[currentQ.id]?.selectedOptionIds.includes(option.id) || false
                          return (
                            <button
                              key={option.id}
                              onClick={() => handleSelect(currentQ, option.id)}
                              disabled={submitted}
                              aria-pressed={selected}
                              className={cn(
                                'w-full p-4 rounded-lg border text-left transition-all',
                                selected
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    'h-7 w-7 rounded-full flex items-center justify-center text-sm font-semibold shrink-0',
                                    selected
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-slate-100 text-slate-600'
                                  )}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="text-slate-700">{option.text}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>}
                      {currentQ.type === 'multiple_choice' && <p className="text-xs text-slate-500">本题可选择多个答案</p>}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一题
                  </Button>

                  {currentPage < totalQuestions - 1 ? (
                    <Button
                      onClick={() => setCurrentPage((p) => Math.min(totalQuestions - 1, p + 1))}
                      className="gap-1"
                    >
                      下一题
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} disabled={Object.keys(answers).length === 0}>
                      提交答案
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4 mb-4">
                  <div className="flex items-center justify-between px-1">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />
                      共 {totalQuestions} 题
                    </Badge>
                    <div className="flex items-center gap-1 text-sm">
                      <Timer className="h-4 w-4 text-slate-500" />
                      <span className="text-slate-600">
                        已进行 {elapsed}s
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <span className="font-medium text-slate-700">学生答题进度</span>
                      <span className="text-slate-500">
                        {answeredCount} / {participants.filter((p) => p.role !== 'teacher').length} 已答
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-primary transition-all"
                        style={{
                          width: `${
                            participants.filter((p) => p.role !== 'teacher').length > 0
                              ? (answeredCount / participants.filter((p) => p.role !== 'teacher').length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {rawQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-3 rounded-lg border border-slate-200 bg-white"
                      >
                        <div className="font-medium text-sm text-slate-800 mb-2">
                          {idx + 1}. {q.text}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(q.options || []).map((option, oIdx) => {
                            const correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]
                            const isCorrect = Boolean(q.correctAnswer) && correctAnswers.includes(option.id)
                            const percent = 0
                            return (
                              <div
                                  key={option.id}
                                className={cn(
                                  'relative p-2 rounded-md text-xs overflow-hidden',
                                  isCorrect ? 'bg-emerald-100 border border-emerald-200' : 'bg-slate-100 border border-slate-200'
                                )}
                              >
                                <div
                                  className={cn(
                                    'absolute inset-0',
                                    isCorrect ? 'bg-emerald-400/30' : 'bg-slate-300/30'
                                  )}
                                  style={{ width: `${percent}%` }}
                                />
                                <div className="relative flex items-center justify-between">
                                  <span className="text-slate-700">
                                    {String.fromCharCode(65 + oIdx)}. {option.text.slice(0, 20)}{option.text.length > 20 ? '...' : ''}
                                  </span>
                                  <span className="font-semibold text-slate-600">暂无统计</span>
                                </div>
                              </div>
                            )
                          })}
                          {q.type === 'short_answer' && <div className="col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">参考答案：{typeof q.correctAnswer === 'string' ? q.correctAnswer : '未设置'}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>
                    稍后再看
                  </Button>
                  <Button variant="destructive" onClick={onEndEarly}>
                    提前结束
                  </Button>
                  <Button onClick={() => setShowResults(true)}>
                    查看排行榜
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
