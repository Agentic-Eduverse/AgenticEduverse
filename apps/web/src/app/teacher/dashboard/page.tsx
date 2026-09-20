'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader } from '@/components/ui/loader'
import CreateClassDialog from '@/components/teacher/CreateClassDialog'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import { GraduationCap, Users, Plus, Copy, PlayCircle, Calendar, Loader2 } from 'lucide-react'

interface ClassItem {
  id: string
  name: string
  roomCode: string
  isLive: boolean
  enrollmentsCount: number
  scheduledAt?: string | Date
  password?: string | null
}

export default function TeacherDashboardPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    loadClasses()
  }, [])

  const loadClasses = async () => {
    setLoading(true)
    try {
      const data = await api.classes.list()
      setClasses(data as ClassItem[])
    } catch (err) {
      // handled in api client
    } finally {
      setLoading(false)
    }
  }

  const copyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success(t('teacherDash.roomCodeCopied', { code }))
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            {t('teacherDash.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('teacherDash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Button onClick={() => setDialogOpen(true)} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            {t('teacherDash.createClass')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <Card key={cls.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-xl line-clamp-1">{cls.name}</CardTitle>
                  <Badge variant={cls.isLive ? 'success' : 'secondary'}>
                    {cls.isLive ? (
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                        {t('teacherDash.live')}
                      </span>
                    ) : (
                      t('teacherDash.notStarted')
                    )}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <Users className="h-3.5 w-3.5" />
                  {t('teacherDash.studentCount', { count: cls.enrollmentsCount })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cls.scheduledAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(cls.scheduledAt).toLocaleString()}
                  </div>
                )}
                <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('teacherDash.roomCode')}</p>
                    <p className="font-mono font-bold text-lg tracking-wider">{cls.roomCode}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyRoomCode(cls.roomCode)}
                    title={t('teacherDash.copyRoomCode')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/teacher/class/${cls.id}`}>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {t('teacherDash.enterClassroom')}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <CreateClassDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          loadClasses()
          router.refresh()
        }}
      />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl bg-muted/20">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <GraduationCap className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('teacherDash.emptyTitle')}</h3>
      <p className="text-muted-foreground mb-6 text-center max-w-sm">
        {t('teacherDash.emptyDesc')}
      </p>
      <Button size="lg" onClick={onCreate}>
        <Plus className="mr-2 h-5 w-5" />
        {t('teacherDash.createFirst')}
      </Button>
    </div>
  )
}
