'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'
import { GraduationCap, Users, UserCircle2, Mail, Lock, User, Shield } from 'lucide-react'

type PortalRole = 'teacher' | 'student' | 'parent'

/** Translation keys for the three portal names, resolved with `t` at render time. */
const ROLE_LABEL_KEYS: Record<
  PortalRole,
  'login.roleTeacher' | 'login.roleStudent' | 'login.roleParent'
> = {
  teacher: 'login.roleTeacher',
  student: 'login.roleStudent',
  parent: 'login.roleParent',
}

const ROLE_ICONS: Record<PortalRole, typeof GraduationCap> = {
  teacher: GraduationCap,
  student: Users,
  parent: UserCircle2,
}

/** Only accepts the three real portal names; anything else becomes null. */
function toPortalRole(value: string | null | undefined): PortalRole | null {
  const normalized = value?.toLowerCase()
  return normalized === 'teacher' || normalized === 'student' || normalized === 'parent'
    ? normalized
    : null
}

function normalizeRole(value: string | null | undefined): PortalRole {
  return toPortalRole(value) ?? 'student'
}

function getRedirectByRole(role: PortalRole) {
  return `/${role}/dashboard`
}

function getSafeCallbackUrl(value: string | null, role: PortalRole): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  const allowedPrefix = `/${role}`
  return value === allowedPrefix || value.startsWith(`${allowedPrefix}/`) ? value : null
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginPageFallback() {
  const { t } = useI18n()
  return (
    <div className="light-ui min-h-[calc(100vh-4rem)] bg-white p-10 text-center text-slate-700">
      {t('login.loading')}
    </div>
  )
}

function LoginContent() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const callbackUrl = searchParams.get('callbackUrl')
  const callbackRole = callbackUrl?.split('/')[1]
  // An explicit ?role= means the visitor deliberately picked a portal (landing page card,
  // or the middleware bounce below), so it must win over the signed-in session's role.
  const explicitRole = toPortalRole(searchParams.get('role'))
  const defaultRole = explicitRole ?? normalizeRole(callbackRole)
  const sessionRole = session ? normalizeRole(session.user?.role) : null
  // Signed in with a role other than the portal being opened: do NOT silently bounce the
  // visitor to their own dashboard (that is what made every portal look like the student
  // one). Explain the situation and let them switch or register for the right role.
  const roleConflict = Boolean(explicitRole && sessionRole && sessionRole !== defaultRole)

  const selectRole = (role: PortalRole) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('role', role)
    router.replace(`/login?${params.toString()}`)
  }

  useEffect(() => {
    if (!session || roleConflict) return
    const role = normalizeRole(session.user?.role)
    router.replace(getSafeCallbackUrl(callbackUrl, role) || getRedirectByRole(role))
  }, [session, roleConflict, router, callbackUrl])

  return (
    <div className="light-ui relative min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 bg-gradient-to-b from-primary/5 via-white to-slate-50 text-slate-900">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {roleConflict && explicitRole && sessionRole && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">
                {t('login.conflictTitle', { current: t(ROLE_LABEL_KEYS[sessionRole]) })}
              </p>
              <p className="mt-1 leading-6 text-amber-800">
                {t('login.conflictBody', {
                  current: t(ROLE_LABEL_KEYS[sessionRole]),
                  target: t(ROLE_LABEL_KEYS[explicitRole]),
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => signOut({ callbackUrl: `/login?role=${explicitRole}` })}>
                  {t('login.switchAccount')}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={getRedirectByRole(sessionRole)}>
                    {t('login.backToMyPortal', { role: t(ROLE_LABEL_KEYS[sessionRole]) })}
                  </Link>
                </Button>
              </div>
            </div>
          )}
          <RoleSelector role={defaultRole} onChange={selectRole} />
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t('login.tabLogin')}</TabsTrigger>
              <TabsTrigger value="register">{t('login.tabRegister')}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <LoginForm defaultRole={defaultRole} callbackUrl={callbackUrl} />
            </TabsContent>

            <TabsContent value="register">
              <RegisterForm defaultRole={defaultRole} callbackUrl={callbackUrl} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function RoleSelector({ role, onChange }: { role: PortalRole; onChange: (role: PortalRole) => void }) {
  const { t } = useI18n()
  return (
    <div className="mb-4 grid grid-cols-3 gap-2" aria-label={t('login.chooseRole')}>
      {(['teacher', 'student', 'parent'] as PortalRole[]).map((value) => {
        const Icon = ROLE_ICONS[value]
        const selected = role === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(value)}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:border-primary/60 hover:text-primary'}`}
          >
            <Icon className="h-4 w-4" />
            {t(ROLE_LABEL_KEYS[value])}
            {t('login.portalSuffix')}
          </button>
        )
      })}
    </div>
  )
}

function RolePicker({ role, onChange }: { role: PortalRole; onChange: (role: PortalRole) => void }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-3 gap-2">
      {(['teacher', 'student', 'parent'] as PortalRole[]).map((value) => {
        const Icon = ROLE_ICONS[value]
        return (
          <button
            type="button"
            key={value}
            onClick={() => onChange(value)}
            className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-all ${
              role === value ? 'border-primary bg-primary/5 text-primary' : 'border-input hover:border-primary/50'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{t(ROLE_LABEL_KEYS[value])}</span>
          </button>
        )
      })}
    </div>
  )
}

function LoginForm({ defaultRole, callbackUrl }: { defaultRole: PortalRole; callbackUrl: string | null }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (res?.error) {
        toast.error(t('login.wrongCredentials'))
      } else {
        toast.success(t('login.loginSuccess'))
        const user = await api.user.me()
        const role = normalizeRole(user.role)
        window.location.href = getSafeCallbackUrl(callbackUrl, role) || getRedirectByRole(role)
      }
    } catch {
      toast.error(t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label htmlFor="login-email" className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          {t('login.email')}
        </label>
        <Input
          id="login-email"
          type="email"
          placeholder={t('login.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="login-password" className="text-sm font-medium flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          {t('login.password')}
        </label>
        <Input
          id="login-password"
          type="password"
          placeholder={t('login.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('login.loggingIn') : t('login.loginButton')}
      </Button>
    </form>
  )
}

function RegisterForm({ defaultRole, callbackUrl }: { defaultRole: PortalRole; callbackUrl: string | null }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<PortalRole>(defaultRole)
  const [loading, setLoading] = useState(false)

  useEffect(() => setRole(defaultRole), [defaultRole])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.auth.register({ name, email, password, role })
      toast.success(t('login.registerSuccess'))
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (!res?.error) {
        window.location.href = getSafeCallbackUrl(callbackUrl, role) || getRedirectByRole(role)
      }
    } catch (err) {
      // error handled in api client
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label htmlFor="register-name" className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          {t('login.name')}
        </label>
        <Input
          id="register-name"
          placeholder={t('login.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="register-email" className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          {t('login.email')}
        </label>
        <Input
          id="register-email"
          type="email"
          placeholder={t('login.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="register-password" className="text-sm font-medium flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          {t('login.password')}
        </label>
        <Input
          id="register-password"
          type="password"
          placeholder={t('login.passwordHint')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('login.chooseRole')}</label>
        <RolePicker role={role} onChange={setRole} />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('login.registering') : t('login.registerButton')}
      </Button>
    </form>
  )
}
