'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'

export default function ParentInvitePage() {
  const { t } = useI18n()
  const params = useParams()
  const router = useRouter()
  const token = String(params?.token || '')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const redeem = async () => {
    if (!token || loading) return
    setLoading(true)
    try {
      await api.parentLinks.redeem(token)
      setCompleted(true)
    } catch {
      // The shared API client displays the actionable error message.
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container flex min-h-[70vh] items-center justify-center py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{completed ? t('parentDash.inviteSuccess') : t('parentDash.inviteTitle')}</CardTitle>
          <CardDescription>{completed ? t('parentDash.inviteSuccessDesc') : t('parentDash.inviteDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {completed ? (
            <Button className="w-full" onClick={() => router.push('/parent/dashboard')}>{t('parentDash.inviteGoDashboard')}</Button>
          ) : (
            <Button className="w-full" onClick={redeem} disabled={loading || !token}>{loading ? t('parentDash.inviteBinding') : t('parentDash.inviteConfirm')}</Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
