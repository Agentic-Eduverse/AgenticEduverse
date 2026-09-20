'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, type ClientParentReport } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ParentReportPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-950 p-10 text-center text-slate-300">正在加载报告…</main>}><ParentReportContent /></Suspense>
}

function ParentReportContent() {
  const params = useSearchParams()
  const studentId = params.get('studentId') || ''
  const weekStart = params.get('weekStart') || ''
  const requestKey = `${studentId}:${weekStart}`
  const requested = useRef('')
  const [report, setReport] = useState<ClientParentReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = useCallback(async () => {
    if (!studentId || !weekStart) return setError('缺少学生或周起始日期')
    setLoading(true)
    setError('')
    try { setReport(await api.parent.generateReport({ studentId, weekStart })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '报告生成失败') }
    finally { setLoading(false) }
  }, [studentId, weekStart])

  useEffect(() => {
    if (requested.current === requestKey) return
    requested.current = requestKey
    generate()
  }, [requestKey, generate])

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-3xl">本周学习成长报告</CardTitle><p className="text-sm text-slate-300">事实来自已授权的课堂记录，建议由当前配置的 AI 模型生成。</p></CardHeader>
          <CardContent>
            {loading && <p className="text-slate-300">正在分析真实学习记录…</p>}
            {error && <div className="space-y-4"><p className="text-red-300">{error}</p><Button onClick={generate}>重试</Button></div>}
            {report && <div className="grid gap-5 md:grid-cols-2"><ReportList title="本周优势" items={report.strengths} /><ReportList title="需要支持" items={report.areasToSupport} /><ReportList title="家庭活动建议" items={report.homeActivities} /><section className="rounded-2xl border border-slate-700 bg-slate-800 p-5"><h2 className="font-semibold text-cyan-200">鼓励的话</h2><p className="mt-3 leading-7 text-slate-100">{report.encouragementMessage || '暂无内容'}</p></section></div>}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5"><h2 className="font-semibold text-cyan-200">{title}</h2>{items.length ? <ul className="mt-3 space-y-2 text-slate-100">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-3 text-slate-400">暂无数据</p>}</section>
}
