'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'

const MediaRoomPanel = dynamic(() => import('./MediaRoomPanel'), {
  ssr: false,
  loading: () => <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">正在加载音视频组件…</div>,
})

export default function MediaPanel({ classId, isTeacher, tutoringId }: { classId: string; isTeacher: boolean; tutoringId?: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => { api.media.status().then((status) => setConfigured(status.configured)).catch(() => setConfigured(false)) }, [])
  if (configured === null) return <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">正在检测音视频服务…</div>
  if (!configured) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{tutoringId ? '私密辅导会话已建立，但音视频服务尚未配置。请先完成 LiveKit 本机配置。' : '音视频服务尚未配置。课堂文字、白板和测验仍可使用。'}</div>
  return <MediaRoomPanel key={tutoringId || 'main'} classId={classId} isTeacher={isTeacher} tutoringId={tutoringId} />
}
