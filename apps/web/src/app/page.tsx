'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, BookOpenCheck, GraduationCap, Sparkles, Users } from 'lucide-react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

const roleCards = [
  {
    titleKey: 'home.teacherTitle',
    subtitleKey: 'home.teacherSubtitle',
    href: '/teacher',
    role: 'teacher',
    icon: GraduationCap,
    accent: 'from-violet-500/60 via-violet-400/20 to-cyan-400/40',
    glow: 'shadow-[0_0_30px_rgba(124,58,237,0.26)]',
  },
  {
    titleKey: 'home.studentTitle',
    subtitleKey: 'home.studentSubtitle',
    href: '/student',
    role: 'student',
    icon: Sparkles,
    accent: 'from-cyan-500/60 via-cyan-400/15 to-violet-500/40',
    glow: 'shadow-[0_0_30px_rgba(6,182,212,0.28)]',
  },
  {
    titleKey: 'home.parentTitle',
    subtitleKey: 'home.parentSubtitle',
    href: '/parent',
    role: 'parent',
    icon: Users,
    accent: 'from-fuchsia-500/55 via-violet-500/20 to-cyan-400/40',
    glow: 'shadow-[0_0_30px_rgba(168,85,247,0.24)]',
  },
] as const

const particles = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  size: 6 + (index % 4) * 3,
  left: `${6 + index * 5.2}%`,
  top: `${10 + (index % 6) * 12}%`,
  delay: index * 0.18,
  duration: 5 + (index % 5),
}))

export default function HomePage() {
  const { t } = useI18n()

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 hero-grid opacity-70" />

      <div className="absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute left-[-12%] top-[-10%] h-[28rem] w-[28rem] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="animate-aurora absolute bottom-[-16%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="animate-pulse-soft absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />

        {particles.map((particle) => (
          <motion.span
            key={particle.id}
            className="absolute rounded-full bg-cyan-300/70"
            style={{
              width: particle.size,
              height: particle.size,
              left: particle.left,
              top: particle.top,
              boxShadow: '0 0 18px rgba(34,211,238,0.7)',
            }}
            animate={{
              y: [0, -18, 0],
              opacity: [0.28, 0.95, 0.35],
              scale: [1, 1.35, 1],
            }}
            transition={{
              repeat: Number.POSITIVE_INFINITY,
              duration: particle.duration,
              delay: particle.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        {/* The language picker lives here: whatever is chosen applies to every page after it. */}
        <div className="absolute right-5 top-5 z-20 md:right-10 md:top-8">
          <LanguageSwitcher variant="hero" />
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="glass-panel shadow-neon inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.35em] text-cyan-100/90"
          >
            <BookOpenCheck className="h-4 w-4 text-cyan-300" />
            {t('home.badge')}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.08, ease: 'easeOut' }}
            className="relative mt-10 text-center"
          >
            <div className="absolute inset-x-10 top-1/2 h-20 -translate-y-1/2 rounded-full bg-violet-500/20 blur-3xl" />
            <h1 className="text-holographic relative text-5xl font-black tracking-[-0.08em] sm:text-7xl lg:text-[7.5rem]">
              {t('home.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
              {t('home.subtitle')}
            </p>
          </motion.div>

          <div className="mt-14 grid w-full max-w-6xl gap-6 md:grid-cols-3">
            {roleCards.map((card, index) => {
              const Icon = card.icon

              return (
                <motion.div
                  key={card.titleKey}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.18 + index * 0.12, ease: 'easeOut' }}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className="h-full"
                >
                  <Link
                    href={`/login?role=${card.role}`}
                    className={`glass-panel ${card.glow} group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-[28px] border border-white/10 p-7 transition-transform duration-300`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-40 transition-opacity duration-500 group-hover:opacity-70`} />
                    <div className="absolute -right-12 top-[-18%] h-40 w-40 rounded-full bg-white/10 blur-3xl transition-all duration-500 group-hover:scale-125" />

                    <div className="relative flex items-start justify-between">
                      <div className="shadow-neon flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                        <Icon className="h-7 w-7" />
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                        {t('home.rolePortal')}
                      </span>
                    </div>

                    <div className="relative mt-12">
                      <h2 className="text-3xl font-semibold tracking-tight text-white">
                        {t(card.titleKey)}
                      </h2>
                      <p className="mt-4 max-w-xs text-sm leading-7 text-slate-300">
                        {t(card.subtitleKey)}
                      </p>
                    </div>

                    <div className="relative mt-auto flex items-center justify-between pt-10 text-sm text-cyan-100">
                      <span className="font-medium tracking-[0.18em] text-cyan-200/90">
                        {t('home.enterPortal')}
                      </span>
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 transition-all duration-300 group-hover:bg-white/15">
                        <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
