'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Hash, KeyRound, Users } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export default function JoinClassDialog({ open, onOpenChange, onSuccess }: Props) {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setRoomCode('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomCode.trim()) {
      toast.error('请输入房间码')
      return
    }
    // Accept whatever case (and stray spaces/dashes from a pasted code) and normalise before lookup.
    const code = roomCode.replace(/[\s-]/g, '').toUpperCase()
    setLoading(true)
    try {
      const classInfo = await api.classes.lookup(code)
      await api.classes.join(classInfo.id, {
        roomCode: code,
        password: password || undefined,
      })
      toast.success(`成功加入「${classInfo.name}」！`)
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      // handled in api client
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
            <Users className="h-5 w-5 text-primary" />
            加入班级
          </DialogTitle>
          <DialogDescription>
            请输入老师提供的房间码加入班级
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <Hash className="h-4 w-4 text-muted-foreground" />
              房间码 *
            </label>
            <Input
              placeholder="例如：ABC234"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              maxLength={6}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono tracking-widest text-lg"
            />
            <p className="text-xs text-muted-foreground">
              房间码为 6 位字母和数字，不含 0、1、I、O；输入大小写均可
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              加入密码 <span className="text-xs text-muted-foreground">(若老师设置了)</span>
            </label>
            <Input
              type="password"
              placeholder="可选"
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
              {loading ? '加入中...' : '加入班级'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
