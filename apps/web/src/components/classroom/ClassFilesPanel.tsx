'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileItem { id: string; name: string; mimeType: string; size: number; createdAt: string }

/** Fallback cadence for clients that are not in the classroom socket room. */
const POLL_MS = 30_000

export default function ClassFilesPanel({
  classId,
  isTeacher,
  version = 0,
  onChanged,
}: {
  classId: string
  isTeacher: boolean
  /** Bumped by the classroom socket when someone reports the material list changed. */
  version?: number
  /** Lets the uploader announce the change so other participants refresh immediately. */
  onChanged?: () => Promise<boolean>
}) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/classes/${classId}/files`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) {
        // A failure used to be swallowed and the panel silently rendered "暂无教材", which
        // reads as "the teacher uploaded nothing" rather than "these are not visible to you".
        setError(result.message || `加载失败（${response.status}）`)
        return
      }
      setFiles(result.data.files)
      setError(null)
    } catch {
      setError('网络异常，未能加载教材列表')
    }
  }, [classId])

  // `version` changes whenever the socket reports a change, so a student already inside the
  // classroom sees new material without reloading the page.
  useEffect(() => {
    void load()
  }, [load, version])

  // Safety net: the socket only reaches clients that successfully joined the room, so poll
  // while the tab is visible to cover anyone watching without a live classroom session.
  useEffect(() => {
    const handle = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => window.clearInterval(handle)
  }, [load])

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`/api/classes/${classId}/files`, { method: 'POST', body })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '上传失败')
      toast.success('教材已上传，学生端会立即看到')
      await load()
      // Tell everyone else already in the classroom to reload their list. The socket reaches
      // every tab in the room, so no local fallback event is needed.
      await (onChanged?.() ?? Promise.resolve(false))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 text-slate-900">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">课堂教材</strong>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={refreshing} onClick={refresh}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          {isTeacher && (
            <>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
                onChange={(event) => upload(event.target.files?.[0])}
              />
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
                {uploading ? '上传中…' : '上传教材'}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">{error}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {files.length ? (
          files.map((file) => (
            <a
              key={file.id}
              href={`/api/classes/${classId}/files/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-violet-800 hover:bg-violet-50"
            >
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </a>
          ))
        ) : (
          !error && (
            <span className="text-xs text-slate-600">
              {isTeacher ? '暂无教材，点「上传教材」添加' : '老师还没有上传教材'}
            </span>
          )
        )}
      </div>
    </section>
  )
}
