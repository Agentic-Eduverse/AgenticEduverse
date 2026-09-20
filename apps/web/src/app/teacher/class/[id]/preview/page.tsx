'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, type ClientPreviewResponse as PreviewResponse } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader } from '@/components/ui/loader'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Eye,
  Sparkles,
  FileText,
  Plus,
  X,
  Upload,
  Send,
  Download,
} from 'lucide-react'
import CoinRewardToast from '@/components/coin-rewards/CoinRewardToast'

type TeachingStyle = 'warm' | 'rigorous' | 'humorous'

export default function ClassPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params?.id as string

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [teachingStyle, setTeachingStyle] = useState<TeachingStyle>('warm')
  const [courseMaterial, setCourseMaterial] = useState('')
  const [teacherSample, setTeacherSample] = useState('')
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const [script, setScript] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [previewQuestions, setPreviewQuestions] = useState<string[]>([])

  const [newKeyPoint, setNewKeyPoint] = useState('')
  const [newDifficulty, setNewDifficulty] = useState('')

  const canGenerate = courseMaterial.trim().length >= 20
  const [materialId, setMaterialId] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.warning('课程材料内容至少需要 20 字')
      return
    }

    setGenerating(true)
    setStep(2)

    try {
      const result = await api.preview.generate({
        classId,
        teachingStyle,
        courseMaterial: courseMaterial.trim(),
        teacherSample: teacherSample.trim() || undefined,
      })
      setScript(result.script)
      setKeyPoints(result.keyPoints)
      setDifficulties(result.difficulties)
      setPreviewQuestions(result.previewQuestions)
      setMaterialId(result.materialId ?? null)
      setStep(3)
      toast.success('预习内容生成成功！')
    } catch {
      setStep(1)
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish = async () => {
    if (!materialId) {
      toast.error('请先成功生成预习内容')
      return
    }
    setPublishing(true)
    try {
      const result = await api.preview.publish(materialId, {
        script,
        keyPoints,
        difficulties,
        previewQuestions,
      })
      toast.success('预习已发布！')
      if (result.coinsEarned > 0) window.dispatchEvent(new CustomEvent('coin-reward', { detail: { amount: result.coinsEarned, total: result.totalCoins } }))
    } catch {
      return
    } finally {
      setPublishing(false)
    }
  }

  const handleExport = () => {
    const content = `# 课前预习\n\n## 课程脚本\n${script}\n\n## 关键点\n${keyPoints.map((k, i) => `${i + 1}. ${k}`).join('\n')}\n\n## 难点\n${difficulties.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n## 思考问题\n${previewQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '课前预习.md'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  }

  const addBadge = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    if (!value.trim()) return
    setList([...list, value.trim()])
    setValue('')
  }

  const removeBadge = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  return (
    <div className="container py-8">
      <CoinRewardToast />
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/teacher/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Eye className="h-8 w-8 text-primary" />
              课前预习生成器
            </h1>
            <p className="text-muted-foreground mt-1">
              班级 ID: <code className="bg-muted px-2 py-0.5 rounded text-xs">{classId}</code>
            </p>
          </div>
          {step === 3 && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                导出
              </Button>
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? <Loader size="sm" className="mr-2" /> : <Upload className="mr-2 h-4 w-4" />}
                {publishing ? '发布中...' : '发布预习'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-6 mb-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  step >= s
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
              <span
                className={`text-sm font-medium ${
                  step >= s ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s === 1 ? '输入内容' : s === 2 ? 'AI 生成' : '结果展示'}
              </span>
              {s < 3 && <div className={`h-0.5 w-12 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Step 1 · 填写课程信息
            </CardTitle>
            <CardDescription>
              填写教学内容和风格偏好，AI 将自动生成课前预习材料
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">教学风格预设</label>
              <Tabs
                defaultValue={teachingStyle}
                onValueChange={(v) => setTeachingStyle(v as TeachingStyle)}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="warm">🌸 自然亲切</TabsTrigger>
                  <TabsTrigger value="rigorous">📐 严谨逻辑</TabsTrigger>
                  <TabsTrigger value="humorous">😄 幽默生动</TabsTrigger>
                </TabsList>
                <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <TabsContent value="warm">
                    语气温和、注重鼓励、多用生活化例子，适合低年级或基础薄弱学生
                  </TabsContent>
                  <TabsContent value="rigorous">
                    结构清晰、逻辑严密、注重推理过程，适合高年级或理科课程
                  </TabsContent>
                  <TabsContent value="humorous">
                    轻松活泼、穿插趣味梗、用比喻让抽象概念变有趣，适合兴趣培养类课程
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                课程材料内容 <Badge variant="outline" className="ml-2">至少 100 字</Badge>
                <span className={`ml-2 text-xs ${canGenerate ? 'text-green-600' : 'text-muted-foreground'}`}>
                  ({courseMaterial.length} / 100)
                </span>
              </label>
              <textarea
                value={courseMaterial}
                onChange={(e) => setCourseMaterial(e.target.value)}
                placeholder="粘贴本节课的知识点、教材内容或教案摘要。例如：二次函数的基本形式 y=ax²+bx+c，其中 a≠0。当 a>0 时抛物线开口向上，a<0 时开口向下..."
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                教师风格样本（可选）
                <Badge variant="outline" className="ml-2">30秒约150字</Badge>
              </label>
              <textarea
                value={teacherSample}
                onChange={(e) => setTeacherSample(e.target.value)}
                placeholder="粘贴一段你过去的讲课文本，AI 将学习你的语言风格和口头禅。例如：同学们注意啦，这里有个小技巧哦..."
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>

            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={generating || !canGenerate}
              className="w-full sm:w-auto"
            >
              {generating ? (
                <>
                  <Loader size="sm" className="mr-2" />
                  AI 生成中，请稍候...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成课前预习
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="py-20 flex flex-col items-center justify-center">
            <div className="relative">
              <Loader size="lg" className="h-16 w-16" />
              <Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-yellow-500 animate-pulse" />
            </div>
            <p className="mt-6 text-lg font-medium">AI 正在精心准备预习内容...</p>
            <p className="text-sm text-muted-foreground mt-1">
              分析教学风格 → 提炼关键点 → 编写脚本 → 设计思考题
            </p>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                脚本 Script
                <Badge variant="outline" className="ml-auto text-xs">
                  {script.length} 字
                </Badge>
              </CardTitle>
              <CardDescription>可直接编辑修改，学生端将逐段播放此内容</CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={12}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                🎯 关键点 Key Points
              </CardTitle>
              <CardDescription>学生端同步展示的核心知识点</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {keyPoints.map((kp, idx) => (
                  <Badge key={idx} variant="secondary" className="pl-3 pr-1 py-1.5 text-sm gap-2">
                    <span>{idx + 1}. {kp}</span>
                    <button
                      onClick={() => removeBadge(keyPoints, setKeyPoints, idx)}
                      className="ml-1 h-5 w-5 rounded-full hover:bg-background flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newKeyPoint}
                  onChange={(e) => setNewKeyPoint(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    addBadge(keyPoints, setKeyPoints, newKeyPoint, setNewKeyPoint)
                  }
                  placeholder="添加新的关键点..."
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => addBadge(keyPoints, setKeyPoints, newKeyPoint, setNewKeyPoint)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                ⚠️ 难点 Difficulties
              </CardTitle>
              <CardDescription>学生需要特别注意的易错/难懂点</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {difficulties.map((d, idx) => (
                  <Badge key={idx} variant="warning" className="pl-3 pr-1 py-1.5 text-sm gap-2">
                    <span>{d}</span>
                    <button
                      onClick={() => removeBadge(difficulties, setDifficulties, idx)}
                      className="ml-1 h-5 w-5 rounded-full hover:bg-background flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    addBadge(difficulties, setDifficulties, newDifficulty, setNewDifficulty)
                  }
                  placeholder="添加新的难点..."
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => addBadge(difficulties, setDifficulties, newDifficulty, setNewDifficulty)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-purple-500" />
                思考问题 Preview Questions
              </CardTitle>
              <CardDescription>预习结尾引导学生主动思考的问题</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {previewQuestions.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold">
                      Q{idx + 1}
                    </span>
                    <textarea
                      value={q}
                      onChange={(e) => {
                        const newList = [...previewQuestions]
                        newList[idx] = e.target.value
                        setPreviewQuestions(newList)
                      }}
                      rows={2}
                      className="flex-1 bg-transparent border-none focus:outline-none text-sm resize-none p-0"
                    />
                    <button
                      onClick={() =>
                        setPreviewQuestions(previewQuestions.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="lg:col-span-2 flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStep(1)}>
              重新生成
            </Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader size="sm" className="mr-2" /> : <Upload className="mr-2 h-4 w-4" />}
              {publishing ? '发布中...' : '发布预习'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
