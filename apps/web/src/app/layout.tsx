import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { Toaster } from 'sonner'
import AppSessionProvider from '@/components/AppSessionProvider'
import PagePerformanceController from '@/components/PagePerformanceController'
import { I18nProvider } from '@/lib/i18n'
import { LOCALE_COOKIE, htmlLangOf, normalizeLocale } from '@/lib/i18n/config'

export const metadata: Metadata = {
  title: 'Agentic EduVerse',
  description: 'A futuristic local-first education prototype for teachers, students, and parents.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Reading the locale cookie here (rather than only in the browser) means the very first
  // server-rendered HTML is already in the visitor's language - no flash, no hydration drift.
  const locale = normalizeLocale(cookies().get(LOCALE_COOKIE)?.value)

  return (
    <html lang={htmlLangOf(locale)} suppressHydrationWarning>
      <body className="min-h-screen bg-[#0B1120] font-sans text-white antialiased">
        <I18nProvider initialLocale={locale}>
          <PagePerformanceController />
          <AppSessionProvider>
            {children}
          </AppSessionProvider>
        </I18nProvider>
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  )
}
