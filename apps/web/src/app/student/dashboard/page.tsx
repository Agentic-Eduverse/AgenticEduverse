'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader } from '@/components/ui/loader'
import JoinClassDialog from '@/components/student/JoinClassDialog'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import { Users, Plus, PlayCircle, Calendar, Crown, GraduationCap } from 'lucide-react'

interface StudentClassItem {
  id: string
  name: string
  roomCode: string
  isLive: boolean
  enrollmentsCount: number
  scheduledAt?: string | Date
  teacherName?: string
}

export default function StudentDashboardPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { data: session } = useSession()
  const [classes, setClasses] = useState<StudentClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [coins, setCoins] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    loadClasses()
    api.user.me().then((user) => {
      setCoins(user.coins)
      const config = user.avatarConfig as { customImageUrl?: unknown } | undefined
      setAvatarUrl(typeof config?.customImageUrl === 'string' ? config.customImageUrl : null)
    }).catch(() => undefined)
  }, [])

  const loadClasses = async () => {
    setLoading(true)
    try {
      const data = await api.classes.list()
      setClasses(data as StudentClassItem[])
    } catch (err) {
      // handled in api
    } finally {
      setLoading(false)
    }
  }

  const userName = session?.user?.name || t('studentDash.defaultName')

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-4 ring-primary/20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={`${userName}的头像`} />}
            {!avatarUrl && (
              <AvatarFallback className="text-lg bg-gradient-to-br from-primary to-purple-500 text-white">
                {userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">
              {t('studentDash.greeting', { name: userName })}
            </h1>
            <p className="text-muted-foreground mt-1">{t('studentDash.encouragement')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Badge variant="warning" className="text-base px-4 py-1.5 gap-2">
            <Crown className="h-4 w-4" />
            <span className="font-semibold">{coins}</span>
            <span className="text-xs opacity-80">{t('common.coins')}</span>
          </Badge>
          <Button size="lg" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-5 w-5" />
            {t('studentDash.joinClass')}
          </Button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickActionCard
          title={t('studentDash.quickAvatar')}
          desc={t('studentDash.quickAvatarDesc')}
          icon="🎨"
          href="/student/avatar"
          color="from-pink-500 to-purple-500"
        />
        <QuickActionCard
          title={t('studentDash.quickTutor')}
          desc={t('studentDash.quickTutorDesc')}
          icon="🤖"
          href="/student/tutor"
          color="from-blue-500 to-cyan-500"
        />
        <QuickActionCard
          title={t('studentDash.quickRoleplay')}
          desc={t('studentDash.quickRoleplayDesc')}
          icon="🎭"
          href="/roleplay/welcome"
          color="from-amber-500 to-orange-500"
        />
      </div>

      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        {t('studentDash.myClasses')}
      </h2>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState onJoin={() => setDialogOpen(true)} />
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
                        {t('studentDash.live')}
                      </span>
                    ) : (
                      t('studentDash.notStarted')
                    )}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {cls.teacherName || t('common.teacher')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cls.scheduledAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(cls.scheduledAt).toLocaleString()}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {t('studentDash.joinedCount', { count: cls.enrollmentsCount })}
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/student/class/${cls.id}`}>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {t('studentDash.enterClassroom')}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <JoinClassDialog
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

function QuickActionCard({
  title,
  desc,
  icon,
  href,
  color,
}: {
  title: string
  desc: string
  icon: string
  href: string
  color: string
}) {
  return (
    <Link href={href} className="block group">
      <Card className="overflow-hidden h-full hover:shadow-lg transition-all duration-300 group-hover:-translate-y-1">
        <div className={`h-24 bg-gradient-to-r ${color} flex items-center justify-center text-5xl`}>
          {icon}
        </div>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}

function EmptyState({ onJoin }: { onJoin: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl bg-muted/20">
      <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mb-4 text-5xl">
        🎒
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('studentDash.emptyTitle')}</h3>
      <p className="text-muted-foreground mb-6 text-center max-w-sm">
        {t('studentDash.emptyDesc')}
      </p>
      <Button size="lg" onClick={onJoin}>
        <Plus className="mr-2 h-5 w-5" />
        {t('studentDash.joinClass')}
      </Button>
    </div>
  )
}
