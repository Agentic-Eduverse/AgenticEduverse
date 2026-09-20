'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n'

const MediaRoomPanel = dynamic(() => import('./MediaRoomPanel'), { ssr: false })

export default function MediaPanel({ classId, isTeacher, tutoringId }: { classId: string; isTeacher: boolean; tutoringId?: string }) {
  const { t } = useI18n()
  const [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => { api.media.status().then((status) => setConfigured(status.configured)).catch(() => setConfigured(false)) }, [])
  if (configured === null) return <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">{t('classroom.mediaChecking')}</div>
  if (!configured) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{tutoringId ? t('classroom.privateMediaNotConfigured') : t('classroom.mediaNotConfigured')}</div>
  return <MediaRoomPanel key={tutoringId || 'main'} classId={classId} isTeacher={isTeacher} tutoringId={tutoringId} />
}
