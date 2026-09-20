'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader } from '@/components/ui/loader'
import { pickCloudModel } from '@/lib/cloud-llm'
import {
  AUTO_DETECT,
  CORE_TRANSLATE_LANGUAGES,
  EXTRA_TRANSLATE_LANGUAGES,
  TRANSLATE_LANGUAGES,
  requestCloudTranslation,
  type CloudTranslationResult,
} from '@/lib/translate'
import { useI18n } from '@/lib/i18n'
import { Languages, ArrowLeftRight, Copy, Check, Eraser, History } from 'lucide-react'

const MAX_INPUT = 2000
const PAIR_STORAGE_KEY = 'eduverse:translator:language-pair'
const RECENT_LIMIT = 6

interface RecentEntry {
  id: string
  sourceLabel: string
  targetLabel: string
  input: string
  output: string
}

const selectClass =
  'h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export default function TranslatorPanel() {
  const { t } = useI18n()
  const [sourceLang, setSourceLang] = useState<string>(AUTO_DETECT)
  const [targetLang, setTargetLang] = useState<string>('en')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<CloudTranslationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  // null = still probing the cloud channel.
  const [channelReady, setChannelReady] = useState<boolean | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])

  useEffect(() => {
    pickCloudModel()
      .then(() => setChannelReady(true))
      .catch(() => setChannelReady(false))
  }, [])

  // Remember the language pair between visits.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PAIR_STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as { sourceLang?: string; targetLang?: string }
      const known = new Set(TRANSLATE_LANGUAGES.map((item) => item.code))
      if (parsed.sourceLang === AUTO_DETECT || known.has(parsed.sourceLang ?? '')) {
        setSourceLang(parsed.sourceLang as string)
      }
      if (known.has(parsed.targetLang ?? '')) setTargetLang(parsed.targetLang as string)
    } catch {
      // A corrupt preference must never break the panel.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(PAIR_STORAGE_KEY, JSON.stringify({ sourceLang, targetLang }))
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  }, [sourceLang, targetLang])

  // Bringing the detected language back to a code lets "swap" produce a meaningful target.
  const detectedCode = useMemo(() => {
    if (!result?.detectedSource) return null
    return TRANSLATE_LANGUAGES.find((item) => item.label === result.detectedSource)?.code ?? null
  }, [result])

  const sourceLabel =
    sourceLang === AUTO_DETECT
      ? t('translator.autoDetect')
      : TRANSLATE_LANGUAGES.find((item) => item.code === sourceLang)?.label ?? sourceLang
  const targetLabel = TRANSLATE_LANGUAGES.find((item) => item.code === targetLang)?.label ?? targetLang

  const overLimit = input.length > MAX_INPUT
  const canTranslate = input.trim().length > 0 && !overLimit && !loading && channelReady !== false

  const handleTranslate = async () => {
    if (!canTranslate) return
    const text = input.trim()
    setLoading(true)
    try {
      const translated = await requestCloudTranslation({
        text,
        sourceLanguage: sourceLang === AUTO_DETECT ? AUTO_DETECT : sourceLabel,
        targetLanguage: targetLabel,
      })
      setResult(translated)
      setCopied(false)
      setRecent((prev) => [
        {
          id: `${Date.now()}`,
          sourceLabel: translated.detectedSource ?? sourceLabel,
          targetLabel,
          input: text,
          output: translated.translation,
        },
        ...prev,
      ].slice(0, RECENT_LIMIT))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      toast.error(message === 'INVALID_TRANSLATION_RESPONSE' ? t('translator.parseFailed') : t('translator.unavailable'))
    } finally {
      setLoading(false)
    }
  }

  const handleSwap = () => {
    const nextSource = sourceLang === AUTO_DETECT ? detectedCode ?? 'zh-Hans' : sourceLang
    setSourceLang(targetLang)
    setTargetLang(nextSource)
    // Seed the box with the译文 so the reverse direction can be checked right away.
    if (result) {
      setInput(result.translation)
      setResult(null)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.translation)
      setCopied(true)
      toast.success(t('translator.copiedToast'))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('translator.copyFailed'))
    }
  }

  const handleClear = () => {
    setInput('')
    setResult(null)
    setCopied(false)
  }

  const restoreRecent = (entry: RecentEntry) => {
    setInput(entry.input)
    setResult({ translation: entry.output, detectedSource: null, notes: null })
    setCopied(false)
  }

  return (
    <div className="space-y-4">
      <Card className="flex h-[70vh] flex-col">
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
              <Languages className="h-4 w-4" />
            </span>
            <div className="flex items-center gap-2">
              <span>{t('translator.title')}</span>
              <Badge variant={channelReady ? 'success' : 'secondary'} className="gap-1 h-5">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {channelReady === null
                  ? t('translator.statusChecking')
                  : channelReady
                    ? t('translator.statusReady')
                    : t('translator.statusMissing')}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto pt-4">
          <div className="flex items-center gap-2">
            <select
              aria-label={t('translator.source')}
              value={sourceLang}
              onChange={(event) => setSourceLang(event.target.value)}
              className={selectClass}
            >
              <option value={AUTO_DETECT}>{t('translator.autoDetect')}</option>
              <optgroup label={t('translator.coreLanguages')}>
                {CORE_TRANSLATE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('translator.moreLanguages')}>
                {EXTRA_TRANSLATE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </optgroup>
            </select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('translator.swap')}
              title={t('translator.swapTitle')}
              onClick={handleSwap}
              className="shrink-0"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>

            <select
              aria-label={t('translator.target')}
              value={targetLang}
              onChange={(event) => setTargetLang(event.target.value)}
              className={selectClass}
            >
              <optgroup label={t('translator.coreLanguages')}>
                {CORE_TRANSLATE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('translator.moreLanguages')}>
                {EXTRA_TRANSLATE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="space-y-1.5">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void handleTranslate()
                }
              }}
              placeholder={t('translator.placeholder')}
              rows={5}
              spellCheck={false}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('translator.sourceLabel', { language: sourceLabel })}</span>
              <span className={overLimit ? 'text-destructive' : ''}>
                {input.length} / {MAX_INPUT}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleTranslate} disabled={!canTranslate}>
              {loading ? <Loader size="sm" /> : <Languages className="h-4 w-4" />}
              <span className="ml-1">
                {loading
                  ? t('translator.translating')
                  : t('translator.translateInto', { language: targetLabel })}
              </span>
            </Button>
            <Button type="button" variant="outline" onClick={handleClear} disabled={loading || (!input && !result)}>
              <Eraser className="h-4 w-4" />
              <span className="ml-1">{t('translator.clear')}</span>
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t('translator.resultTitle', { language: targetLabel })}</span>
                {sourceLang === AUTO_DETECT && result?.detectedSource && (
                  <Badge variant="secondary" className="h-5 text-xs">
                    {t('translator.detectedAs', { language: result.detectedSource })}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!result}
                className="h-8 shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                <span className="ml-1">{copied ? t('translator.copied') : t('translator.copy')}</span>
              </Button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader size="sm" />
                {t('translator.working')}
              </div>
            )}

            {!loading && !result && (
              <p className="py-6 text-sm text-muted-foreground">
                {t('translator.emptyHint', { count: TRANSLATE_LANGUAGES.length })}
              </p>
            )}

            {!loading && result && (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                  {result.translation}
                </p>
                {result.notes && (
                  <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                    {t('translator.notes', { text: result.notes })}
                  </p>
                )}
              </>
            )}
          </div>

          {recent.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <History className="h-4 w-4" />
                {t('translator.recent')}
              </div>
              <div className="space-y-1">
                {recent.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => restoreRecent(entry)}
                    className="w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-accent/40"
                  >
                    <p className="truncate text-sm">{entry.input}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {entry.sourceLabel} → {entry.targetLabel} · {entry.output}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
