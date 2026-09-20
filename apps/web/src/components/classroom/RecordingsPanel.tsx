'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type RecordingItem = { id: string; status: string; startedAt: string; endedAt: string | null; publishedAt: string | null }

export default function RecordingsPanel({ classId, isTeacher }: { classId: string; isTeacher: boolean }) {
  const [recordings, setRecordings] = useState<RecordingItem[]>([])
  const load = useCallback(() => api.media.recordings(classId).then((result) => setRecordings(result.recordings)).catch(() => setRecordings([])), [classId])
  useEffect(() => { load() }, [load])
  useEffect(() => { const refresh = () => { load() }; window.addEventListener('recordings-changed', refresh); return () => window.removeEventListener('recordings-changed', refresh) }, [load])
  useEffect(() => {
    if (!recordings.some((recording) => ['STARTING', 'ACTIVE', 'STOPPING'].includes(recording.status))) return
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [load, recordings])
  const publish = async (id: string) => { try { await api.media.publishRecording(id); toast.success('录像已发布'); await load() } catch {} }
  if (!recordings.length) return null
  return <section className="rounded-lg border border-slate-200 bg-white p-3 text-slate-900"><strong className="text-sm">课堂录像</strong><div className="mt-2 flex flex-wrap gap-2">{recordings.map((recording) => <div key={recording.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs"><span>{new Date(recording.startedAt).toLocaleString('zh-CN')} · {recording.status === 'COMPLETE' ? recording.publishedAt ? '已发布' : '已完成' : recording.status === 'FAILED' ? '失败' : '处理中'}</span>{recording.status === 'COMPLETE' && (isTeacher || recording.publishedAt) && <Button asChild size="sm" variant="outline"><Link href={`/recordings/${recording.id}`}>回放</Link></Button>}{isTeacher && recording.status === 'COMPLETE' && !recording.publishedAt && <Button size="sm" onClick={() => publish(recording.id)}>发布</Button>}</div>)}</div></section>
}
