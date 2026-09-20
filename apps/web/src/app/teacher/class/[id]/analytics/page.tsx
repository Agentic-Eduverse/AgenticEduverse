'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, BarChart3, MessageSquare, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

interface AnalyticsData {
  className: string
  enrolledStudents: number
  trackedSessions: number
  attendanceRate: number | null
  totalMessages: number
  averageQuizScore: number | null
  emotionCounts: Record<string, number>
  timeline: Array<{ id: string; startedAt: string; endedAt: string | null; attendance: number; interactions: number; averageQuizScore: number | null }>
}

const emotionLabels: Record<string, string> = {
  happy: '懂了', confused: '困惑', repeat: '请重复', need_repeat: '请重复', idea: '有想法', have_idea: '有想法',
}

export default function ClassAnalyticsPage() {
  const params = useParams()
  const classId = String(params?.id || '')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/classes/${encodeURIComponent(classId)}/analytics`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { success: boolean; data?: AnalyticsData; message?: string }
        if (!response.ok || !result.success || !result.data) throw new Error(result.message || '加载失败')
        setData(result.data)
        setError('')
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [classId])

  const emotions = data ? Object.entries(data.emotionCounts).map(([name, value]) => ({ name: emotionLabels[name] || name, value })) : []
  const timeline = data?.timeline.map((item) => ({ ...item, label: new Date(item.startedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) })) || []

  return (
    <main className="relative min-h-screen px-4 py-6 text-white md:px-6">
      <div className="absolute inset-0 hero-grid opacity-20" />
      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        <section className="glass-panel shadow-neon rounded-[34px] border border-white/10 px-6 py-8 md:px-8">
          <Button variant="ghost" asChild className="mb-4 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            <Link href={`/teacher/class/${classId}`}><ArrowLeft className="mr-2 h-4 w-4" />返回课堂</Link>
          </Button>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Verified classroom facts</p>
          <h1 className="mt-3 text-4xl font-semibold">课堂事实统计</h1>
          <p className="mt-3 text-slate-300">{data?.className || '课堂'} · 仅展示数据库中已有的课堂、出勤、互动和成绩记录。</p>
        </section>

        {loading && <div className="glass-panel rounded-3xl p-10 text-center"><Loader className="mx-auto" /><p className="mt-3 text-slate-300">正在读取真实记录…</p></div>}
        {!loading && error && <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">{error}</div>}

        {!loading && data && <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: '已入班学生', value: String(data.enrolledStudents) },
              { icon: BarChart3, label: '有记录课堂', value: String(data.trackedSessions) },
              { icon: Users, label: '平均到课率', value: data.attendanceRate === null ? '暂无数据' : `${data.attendanceRate}%` },
              { icon: MessageSquare, label: '课堂消息', value: String(data.totalMessages) },
            ].map(({ icon: Icon, label, value }) => <div key={label} className="glass-panel rounded-3xl border border-white/10 p-5">
              <Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-sm text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>)}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass-panel rounded-[30px] border border-white/10 p-6">
              <h2 className="text-xl font-semibold">课堂记录趋势</h2>
              {timeline.length === 0 ? <p className="mt-8 text-slate-400">暂无课堂 Session 记录</p> : <div className="mt-6 h-80">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={timeline}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} /><XAxis dataKey="label" stroke="#94A3B8" /><YAxis stroke="#94A3B8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                  <Bar dataKey="attendance" name="到课人数" fill="#06B6D4" radius={[6, 6, 0, 0]} /><Bar dataKey="interactions" name="互动记录" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                </BarChart></ResponsiveContainer>
              </div>}
            </div>

            <div className="glass-panel rounded-[30px] border border-white/10 p-6">
              <h2 className="text-xl font-semibold">反馈与测验</h2>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">平均测验成绩</p><p className="mt-1 text-3xl font-semibold">{data.averageQuizScore === null ? '暂无数据' : `${data.averageQuizScore}%`}</p></div>
              <div className="mt-4 space-y-2">
                {emotions.length === 0 && <p className="text-slate-400">暂无情绪反馈记录</p>}
                {emotions.map((item) => <div key={item.name} className="flex justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><span>{item.name}</span><span className="text-cyan-200">{item.value} 次</span></div>)}
              </div>
            </div>
          </section>
        </>}
      </div>
    </main>
  )
}
