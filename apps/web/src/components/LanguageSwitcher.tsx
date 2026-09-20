'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { LOCALE_META, localeMeta, useI18n } from '@/lib/i18n'

interface Props {
  /** `hero` is the large pill used on the landing page; `header` fits the navbar. */
  variant?: 'header' | 'hero'
  className?: string
}

export default function LanguageSwitcher({ variant = 'header', className = '' }: Props) {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hero = variant === 'hero'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = localeMeta(locale)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.languageHint')}
        title={t('common.languageHint')}
        className={
          hero
            ? 'glass-panel group flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-cyan-300/60 hover:text-cyan-100'
            : 'flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-sm font-medium transition-colors hover:border-primary/60 hover:text-primary'
        }
      >
        <Globe className={hero ? 'h-4 w-4 text-cyan-300' : 'h-4 w-4'} />
        <span>{current.native}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('common.languageHint')}
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl"
        >
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('common.languageHint')}</p>
          {LOCALE_META.map((item) => {
            const selected = item.code === locale
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={selected}
                lang={item.htmlLang}
                onClick={() => {
                  setLocale(item.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected ? 'bg-accent text-primary' : 'hover:bg-accent/50'
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium">{item.native}</span>
                  <span className="text-xs text-muted-foreground">{item.zhName}</span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
