'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import LinkChildDialog from '@/components/parent/LinkChildDialog'
import { useI18n } from '@/lib/i18n'
import { Calendar, Crown, Smile, BarChart3, UserCircle2, ArrowRight, Link2 } from 'lucide-react'

type Dashboard = Awaited<ReturnType<typeof api.parent.dashboard>>

export default function ParentDashboardPage() {
  const { t } = useI18n()
  const [children, setChildren] = useState<Array<{ id: string; name: string; grade?: string }>>([])
  const [selectedChild, setSelectedChild] = useState('')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    return date.toISOString().slice(0, 10)
  })
  const [bindOpen, setBindOpen] = useState(false)

  const refreshChildren = async () => {
    try {
      const items = await api.parent.getChildren()
      setChildren(items)
      setSelectedChild(items[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshChildren()
    // Load the linked children once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedChild) return setDashboard(null)
    setLoading(true)
    api.parent.dashboard(selectedChild, weekStart).then(setDashboard).catch(() => setDashboard(null)).finally(() => setLoading(false))
  }, [selectedChild, weekStart])

  const unlink = async () => {
    if (!selectedChild || !window.confirm(t('parentDash.unbindConfirm'))) return
    try {
      await api.parentLinks.unlink(selectedChild)
      const next = children.filter((child) => child.id !== selectedChild)
      setChildren(next)
      setSelectedChild(next[0]?.id || '')
      toast.success(t('parentDash.unbindSuccess'))
    } catch {}
  }

  const child = children.find((item) => item.id === selectedChild)
  const stats = [
    { label: t('parentDash.statAttendance'), value: dashboard ? `${dashboard.attendanceCount} ${t('common.times')}` : t('parentDash.noData'), icon: Calendar },
    { label: t('parentDash.statEmotion'), value: dashboard ? `${dashboard.emotionFeedbacks} ${t('common.times')}` : t('parentDash.noData'), icon: Smile },
    { label: t('parentDash.statQuiz'), value: dashboard?.averageQuizScore === null || !dashboard ? t('parentDash.noData') : `${dashboard.averageQuizScore} ${t('common.points')}`, icon: BarChart3 },
    { label: t('parentDash.statCoins'), value: dashboard ? `${dashboard.coinsEarned}` : t('parentDash.noData'), icon: Crown },
  ]

  return (
    <main className="light-ui min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-3xl font-bold"><UserCircle2 className="h-8 w-8 text-amber-600" />{t('parentDash.title')}</h1><p className="mt-2 text-slate-600">{t('parentDash.subtitle')}</p></div><LanguageSwitcher /></header>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <span className="font-medium">{t('parentDash.selectChild')}</span>
            {children.map((item) => <button key={item.id} onClick={() => setSelectedChild(item.id)} className={`rounded-full border px-4 py-2 text-sm font-medium ${item.id === selectedChild ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-violet-500'}`}>{item.name}</button>)}
            {!loading && children.length === 0 && <span className="text-sm text-slate-600">{t('parentDash.noBinding')}</span>}
            <Button variant="outline" onClick={() => setBindOpen(true)}><Link2 className="mr-1.5 h-4 w-4" />{t('parentDash.bindAction')}</Button>
            <Input suppressHydrationWarning className="ml-auto w-auto" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
            {selectedChild && <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={unlink}>{t('parentDash.unbind')}</Button>}
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm text-slate-700">{label}<Icon className="h-4 w-4" /></CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-slate-950">{loading ? t('common.loading') : value}</p></CardContent></Card>)}</div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>{t('parentDash.emotionTrend')}</CardTitle></CardHeader><CardContent className="space-y-3">{dashboard?.emotionTrend.length ? dashboard.emotionTrend.map((item) => <div key={item.date} className="grid grid-cols-[100px_1fr] items-center gap-3 text-sm"><span>{item.date}</span><div className="flex gap-2"><span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">{t('parentDash.positive', { count: item.happy })}</span><span className="rounded bg-amber-100 px-2 py-1 text-amber-900">{t('parentDash.confused', { count: item.confused })}</span></div></div>) : <p className="text-slate-600">{t('parentDash.noEmotion')}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('parentDash.quizPerformance')}</CardTitle></CardHeader><CardContent className="space-y-3">{dashboard?.subjectScores.length ? dashboard.subjectScores.map((item) => <div key={item.subject}><div className="flex justify-between text-sm"><span>{item.subject}</span><strong>{item.score} {t('common.points')}</strong></div><div className="mt-1 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-violet-600" style={{ width: `${item.score}%` }} /></div></div>) : <p className="text-slate-600">{t('parentDash.noQuiz')}</p>}</CardContent></Card>
        </div>
        <Card className="border-amber-200 bg-amber-50"><CardContent className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h2 className="font-semibold text-slate-950">{child ? t('parentDash.reportFor', { name: child.name }) : t('parentDash.reportDefault')}</h2><p className="mt-1 text-sm text-slate-700">{t('parentDash.reportDesc')}</p></div>{selectedChild ? <Button asChild><Link href={`/parent/report?studentId=${selectedChild}&weekStart=${weekStart}`}>{t('parentDash.generateReport')}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : <Button onClick={() => setBindOpen(true)}><Link2 className="mr-2 h-4 w-4" />{t('parentDash.bindAction')}</Button>}</CardContent></Card>

        <LinkChildDialog open={bindOpen} onOpenChange={setBindOpen} onSuccess={refreshChildren} />
      </div>
    </main>
  )
}
