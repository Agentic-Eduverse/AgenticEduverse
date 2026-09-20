'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { QuizQuestion } from '@eduverse/shared'
import { api, type ClientQuiz } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type QuestionType = QuizQuestion['type']

function clientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function newQuestion(type: QuestionType = 'single_choice'): QuizQuestion {
  const id = clientId()
  if (type === 'short_answer') return { id, type, text: '', correctAnswer: '', points: 1, explanation: '' }
  const labels = type === 'true_false' ? ['正确', '错误'] : ['', '', '', '']
  const options = labels.map((text) => ({ id: clientId(), text }))
  return { id, type, text: '', options, correctAnswer: type === 'multiple_choice' ? [] : options[0].id, points: 1, explanation: '' }
}

export default function QuizManagerDialog({
  open,
  onOpenChange,
  classId,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: string
  onStart: (quizId: string) => Promise<boolean>
}) {
  const [tab, setTab] = useState('saved')
  const [saved, setSaved] = useState<ClientQuiz[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300)
  const [source, setSource] = useState<'MANUAL' | 'AI'>('MANUAL')
  const [material, setMaterial] = useState('')
  const [aiCount, setAiCount] = useState(5)

  const loadSaved = useCallback(async () => {
    try { setSaved(await api.quiz.list(classId)) } catch { setSaved([]) }
  }, [classId])

  useEffect(() => { if (open) loadSaved() }, [open, loadSaved])

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } as QuizQuestion : question))
  }

  const changeType = (index: number, type: QuestionType) => {
    const replacement = newQuestion(type)
    updateQuestion(index, { ...replacement, id: questions[index].id, text: questions[index].text, options: replacement.options })
  }

  const updateOption = (questionIndex: number, optionIndex: number, text: string) => {
    const question = questions[questionIndex]
    updateQuestion(questionIndex, { options: question.options?.map((option, index) => index === optionIndex ? { ...option, text } : option) })
  }

  const validate = (): boolean => {
    if (!title.trim()) return toast.error('请输入测验标题'), false
    if (questions.length === 0) return toast.error('请至少添加一道题目'), false
    for (const [index, question] of questions.entries()) {
      if (!question.text.trim()) return toast.error(`第 ${index + 1} 题缺少题干`), false
      if (question.type !== 'short_answer' && question.options?.some((option) => !option.text.trim())) return toast.error(`第 ${index + 1} 题存在空选项`), false
      if (Array.isArray(question.correctAnswer) ? question.correctAnswer.length === 0 : !question.correctAnswer) return toast.error(`第 ${index + 1} 题缺少正确答案`), false
    }
    return true
  }

  const save = async (startAfterSave: boolean) => {
    if (!validate() || loading) return
    setLoading(true)
    try {
      const quiz = await api.quiz.create({ classId, title: title.trim(), questions, timeLimitSeconds, source })
      await loadSaved()
      toast.success('测验草稿已保存')
      if (startAfterSave) {
        const started = await onStart(quiz.id)
        if (started) onOpenChange(false)
        else toast.error('测验发起失败，请确认当前没有进行中的测验')
      } else {
        setTab('saved')
      }
    } finally {
      setLoading(false)
    }
  }

  const startSaved = async (quiz: ClientQuiz) => {
    setLoading(true)
    try {
      let quizId = quiz.id
      if (quiz.status === 'ENDED') {
        const copy = await api.quiz.create({ classId, title: `${quiz.title}（复用）`, questions: quiz.questions, timeLimitSeconds: quiz.timeLimitSeconds, source: quiz.source })
        quizId = copy.id
      }
      if (await onStart(quizId)) onOpenChange(false)
      else toast.error('测验发起失败，请确认当前没有进行中的测验')
    } finally {
      setLoading(false)
    }
  }

  const generateWithAI = async () => {
    if (material.trim().length < 20) return toast.error('教材内容至少需要 20 字')
    setLoading(true)
    try {
      const draft = await api.ai.generateQuizDraft({ classId, material: material.trim(), count: aiCount })
      setTitle(draft.title)
      setQuestions(draft.questions)
      setSource('AI')
      setTab('manual')
      toast.success('AI 草稿已生成，请检查题目和答案')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="light-ui max-w-4xl bg-white text-slate-900">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader><DialogTitle>测验管理</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 bg-slate-100">
            <TabsTrigger value="saved">已保存</TabsTrigger>
            <TabsTrigger value="manual">手动出题</TabsTrigger>
            <TabsTrigger value="ai">AI 出题</TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="space-y-3">
            {saved.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">暂无测验，请手动创建或生成 AI 草稿。</p>}
            {saved.map((quiz) => (
              <div key={quiz.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                <div><p className="font-semibold text-slate-900">{quiz.title}</p><p className="mt-1 text-sm text-slate-600">{quiz.questions.length} 题 · {quiz.timeLimitSeconds} 秒 · {quiz.source === 'AI' ? 'AI 草稿' : '手动创建'} · {quiz.status === 'DRAFT' ? '草稿' : quiz.status === 'ACTIVE' ? '进行中' : '已结束'}</p></div>
                <Button disabled={loading || quiz.status === 'ACTIVE'} onClick={() => startSaved(quiz)}>{quiz.status === 'ENDED' ? '复用并发起' : quiz.status === 'ACTIVE' ? '进行中' : '发起测验'}</Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="测验标题" />
              <Input type="number" min={15} max={7200} value={timeLimitSeconds} onChange={(event) => setTimeLimitSeconds(Number(event.target.value))} aria-label="答题时限（秒）" />
            </div>
            {questions.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">编辑器为空，请点击“添加题目”开始出题。</p>}
            {questions.map((question, questionIndex) => (
              <section key={question.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <strong className="text-slate-900">第 {questionIndex + 1} 题</strong>
                  <select className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900" value={question.type} onChange={(event) => changeType(questionIndex, event.target.value as QuestionType)}>
                    <option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="true_false">判断题</option><option value="short_answer">简答题</option>
                  </select>
                  <Button type="button" variant="ghost" className="ml-auto text-red-700" onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))}>删除</Button>
                </div>
                <Input value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} placeholder="题干" />
                {question.type === 'short_answer' ? (
                  <Input value={String(question.correctAnswer || '')} onChange={(event) => updateQuestion(questionIndex, { correctAnswer: event.target.value })} placeholder="参考答案" />
                ) : (
                  <div className="space-y-2">
                    {question.options?.map((option, optionIndex) => {
                      const multipleAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer : []
                      const checked = question.type === 'multiple_choice' ? multipleAnswers.includes(option.id) : question.correctAnswer === option.id
                      return <label key={option.id} className="flex items-center gap-2 text-slate-800">
                        <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={`answer-${question.id}`} checked={checked} onChange={(event) => updateQuestion(questionIndex, { correctAnswer: question.type === 'multiple_choice' ? event.target.checked ? [...multipleAnswers, option.id] : multipleAnswers.filter((id) => id !== option.id) : option.id })} />
                        <Input value={option.text} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`选项 ${optionIndex + 1}`} />
                      </label>
                    })}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]"><Input type="number" min={1} max={100} value={question.points || 1} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) })} aria-label="题目分值" /><Input value={question.explanation || ''} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} placeholder="答案解析（可选）" /></div>
              </section>
            ))}
            <Button type="button" variant="outline" onClick={() => setQuestions((current) => [...current, newQuestion()])}>添加题目</Button>
            <DialogFooter><Button variant="outline" disabled={loading} onClick={() => save(false)}>保存草稿</Button><Button disabled={loading} onClick={() => save(true)}>保存并发起</Button></DialogFooter>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <p className="text-sm text-slate-600">AI 只生成草稿，教师必须在“手动出题”页检查并保存。</p>
            <textarea className="min-h-48 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900" value={material} onChange={(event) => setMaterial(event.target.value)} placeholder="粘贴教材、教案或知识点（至少 20 字）" />
            <label className="flex items-center gap-3 text-sm text-slate-800">题目数量 <Input className="w-24" type="number" min={1} max={20} value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))} /></label>
            <Button disabled={loading} onClick={generateWithAI}>{loading ? '生成中…' : '生成 AI 草稿'}</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
