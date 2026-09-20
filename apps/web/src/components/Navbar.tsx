'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { BookOpen, GraduationCap, Users, UserCircle2, Crown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { api } from '@/lib/api-client'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import type { UserRole } from '@eduverse/shared'

type NormalizedRole = 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'

export default function Navbar() {
  const { t } = useI18n()
  const { data: session } = useSession()
  const role = (session?.user?.role as string | undefined)?.toUpperCase() as NormalizedRole | undefined
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.user || role !== 'STUDENT') {
      setAvatarUrl(null)
      return
    }
    const loadAvatar = () => {
      void api.user.me().then((user) => {
        const config = user.avatarConfig as { customImageUrl?: unknown } | undefined
        setAvatarUrl(typeof config?.customImageUrl === 'string' ? config.customImageUrl : null)
      }).catch(() => undefined)
    }
    loadAvatar()
    const handleAvatarUpdated = (event: Event) => {
      const config = (event as CustomEvent<unknown>).detail as { customImageUrl?: unknown } | undefined
      if (typeof config?.customImageUrl === 'string') setAvatarUrl(config.customImageUrl)
      else loadAvatar()
    }
    window.addEventListener('avatar-updated', handleAvatarUpdated)
    return () => window.removeEventListener('avatar-updated', handleAvatarUpdated)
  }, [role, session?.user])

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="gradient-text">EduVerse</span>
        </Link>

        <div className="flex items-center gap-4">
          {session ? (
            <>
              <div className="hidden md:flex items-center gap-2">
                {role === 'TEACHER' && (
                  <>
                    <Button variant="ghost" asChild>
                      <Link href="/teacher/dashboard">
                        <GraduationCap className="mr-2 h-4 w-4" />
                        {t('nav.dashboard')}
                      </Link>
                    </Button>
                  </>
                )}
                {role === 'STUDENT' && (
                  <>
                    <Button variant="ghost" asChild>
                      <Link href="/student/dashboard">
                        <Users className="mr-2 h-4 w-4" />
                        {t('nav.dashboard')}
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href="/student/avatar">
                        <UserCircle2 className="mr-2 h-4 w-4" />
                        {t('nav.avatar')}
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href="/student/tutor">
                        <SparklesIcon className="mr-2 h-4 w-4" />
                        {t('nav.tutor')}
                      </Link>
                    </Button>
                  </>
                )}
                {role === 'PARENT' && (
                  <>
                    <Button variant="ghost" asChild>
                      <Link href="/parent/dashboard">
                        <Users className="mr-2 h-4 w-4" />
                        {t('nav.dashboard')}
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href="/parent/report">
                        <TrendingUpIcon className="mr-2 h-4 w-4" />
                        {t('nav.report')}
                      </Link>
                    </Button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="warning" className="gap-1">
                  <Crown className="h-3 w-3" />
                  <span>120</span>
                </Badge>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 rounded-full p-1 hover:bg-accent transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={`${session?.user?.name || '用户'}的头像`} />}
                      {!avatarUrl && (
                        <AvatarFallback>
                          {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-md border bg-popover p-1 shadow-md animate-fade-in">
                      <div className="px-3 py-2 border-b">
                        <p className="text-sm font-medium">{session?.user?.name}</p>
                        <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive"
                        onClick={() => signOut()}
                      >
                        {t('nav.logout')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <Button asChild>
              <Link href="/login">{t('nav.login')}</Link>
            </Button>
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}

function TrendingUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
