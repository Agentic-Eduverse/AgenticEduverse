'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'
import { Link2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * Accepts either the full invitation URL the teacher sends or the bare token, so a parent who
 * was given only the code (or pasted the whole link) is not stuck.
 */
function extractToken(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const fromUrl = value.match(/\/parent\/invite\/([^/?#\s]+)/)
  if (fromUrl) return decodeURIComponent(fromUrl[1])
  return value.replace(/[?#].*$/, '').replace(/\/+$/, '').trim()
}

export default function LinkChildDialog({ open, onOpenChange, onSuccess }: Props) {
  const { t } = useI18n()
  const { data: session } = useSession()
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const token = extractToken(value)
    // The API enforces min length 20; catching it here gives a clearer message than a 400.
    if (token.length < 20) {
      toast.error(t('parentDash.bindInvalid'))
      return
    }
    setLoading(true)
    try {
      const result = await api.parentLinks.redeem(token)
      toast.success(t('parentDash.bindSuccess', { name: result.child.studentName }))
      setValue('')
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // The shared API client surfaces the specific reason (expired, already used, wrong email…).
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
            <Link2 className="h-5 w-5 text-primary" />
            {t('parentDash.bindTitle')}
          </DialogTitle>
          <DialogDescription>{t('parentDash.bindDesc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('parentDash.bindPlaceholder')}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-mono text-sm"
          />

          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            {t('parentDash.bindEmailNote', { email: session?.user?.email ?? '—' })}
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading || !value.trim()}>
              {loading ? t('parentDash.bindSubmitting') : t('parentDash.bindSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
