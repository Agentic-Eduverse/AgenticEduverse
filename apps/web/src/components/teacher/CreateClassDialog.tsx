'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GraduationCap, Clock, KeyRound } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const MIN_DURATION_MINUTES = 10
const MAX_DURATION_MINUTES = 300
// A datetime-local field only produces a value once every segment (year, month, day,
// hour, minute) has been filled. Anything half-typed is reported as an empty string.
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

export default function CreateClassDialog({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')
  // Held as a string so the field can be cleared and retyped; parsed and validated on submit.
  const [durationMinutes, setDurationMinutes] = useState('45')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setName('')
    setStartTime('')
    setDurationMinutes('45')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请输入班级名称')
      return
    }
    if (!startTime || !DATETIME_LOCAL_PATTERN.test(startTime)) {
      toast.error('请完整选择上课时间（年、月、日、时、分）')
      return
    }
    const scheduledAt = new Date(startTime)
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error('上课时间无效，请重新选择')
      return
    }
    const duration = Number(durationMinutes)
    if (!Number.isInteger(duration)) {
      toast.error('课时需要填写整数分钟数')
      return
    }
    if (duration < MIN_DURATION_MINUTES || duration > MAX_DURATION_MINUTES) {
      toast.error(`课时需要在 ${MIN_DURATION_MINUTES} 到 ${MAX_DURATION_MINUTES} 分钟之间`)
      return
    }
    setLoading(true)
    try {
      await api.classes.create({
        name: name.trim(),
        startTime: scheduledAt.toISOString(),
        durationMinutes: duration,
        password: password || undefined,
      })
      toast.success('班级创建成功！')
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // The shared API client displays the actionable error message.
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            创建新班级
          </DialogTitle>
          <DialogDescription>
            填写课堂信息，学生可通过房间码加入您的课堂
          </DialogDescription>
        </DialogHeader>

        {/* noValidate: native browser validation aborts submit with an untranslated
            "enter a valid value" bubble, which bypasses every message below. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">班级名称 *</label>
            <Input
              placeholder="例如：高一(3)班英语课"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                上课时间 *
                <span className="text-xs font-normal text-muted-foreground">(年-月-日 时:分)</span>
              </label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">课时 (分钟)</label>
              <Input
                type="number"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                step={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              加入密码 <span className="text-xs text-muted-foreground">(可选)</span>
            </label>
            <Input
              type="password"
              placeholder="不填则无需密码即可加入"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={20}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '创建中...' : '创建班级'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
