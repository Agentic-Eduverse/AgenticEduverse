'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Participant } from '@eduverse/shared'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: string
  students: Participant[]
}

export default function ParentInviteDialog({ open, onOpenChange, classId, students }: Props) {
  const [studentId, setStudentId] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [invitations, setInvitations] = useState<Array<{ id: string; studentName: string; parentEmail: string; expiresAt: string; redeemedAt: string | null; revokedAt: string | null }>>([])

  useEffect(() => {
    if (open && !studentId && students[0]) setStudentId(students[0].userId)
  }, [open, studentId, students])

  useEffect(() => {
    if (open) api.parentLinks.listInvitations(classId).then(setInvitations).catch(() => undefined)
  }, [open, classId])

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!studentId || !parentEmail.trim() || loading) return
    setLoading(true)
    try {
      const invitation = await api.parentLinks.createInvitation({ studentId, classId, parentEmail: parentEmail.trim() })
      setInviteUrl(`${window.location.origin}${invitation.path}`)
      api.parentLinks.listInvitations(classId).then(setInvitations).catch(() => undefined)
      toast.success('邀请已创建，24 小时内有效')
    } catch {
      // The shared API client displays the actionable error message.
    } finally {
      setLoading(false)
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success('邀请链接已复制')
    } catch {
      toast.error('复制失败，请手动复制链接')
    }
  }

  const revoke = async (id: string) => {
    try {
      await api.parentLinks.revokeInvitation(id)
      setInvitations((current) => current.map((item) => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item))
      toast.success('邀请及其绑定已撤销')
    } catch {
      // The shared API client displays the actionable error message.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>邀请家长绑定学生</DialogTitle>
          <DialogDescription>邀请只能由指定邮箱的家长账号兑换一次。</DialogDescription>
        </DialogHeader>
        <form onSubmit={createInvite} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            学生
            <select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3" value={studentId} onChange={(event) => setStudentId(event.target.value)} required>
              <option value="" disabled>选择已入班学生</option>
              {students.map((student) => <option key={student.userId} value={student.userId}>{student.name}</option>)}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            家长邮箱
            <Input className="mt-2" type="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} maxLength={320} required />
          </label>
          {inviteUrl && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="break-all text-xs text-muted-foreground">{inviteUrl}</p>
              <Button type="button" variant="outline" size="sm" onClick={copyInvite}>复制邀请链接</Button>
            </div>
          )}
          {invitations.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto border-t pt-3">
              <p className="text-sm font-medium">最近邀请</p>
              {invitations.map((invitation) => {
                const active = !invitation.revokedAt && !invitation.redeemedAt && new Date(invitation.expiresAt).getTime() > Date.now()
                return <div key={invitation.id} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                  <span className="min-w-0 truncate">{invitation.studentName} · {invitation.parentEmail} · {invitation.redeemedAt ? '已兑换' : invitation.revokedAt ? '已撤销' : active ? '待兑换' : '已过期'}</span>
                  {(active || invitation.redeemedAt) && <Button type="button" size="sm" variant="destructive" onClick={() => revoke(invitation.id)}>撤销</Button>}
                </div>
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading || students.length === 0}>{loading ? '创建中…' : '创建邀请'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
