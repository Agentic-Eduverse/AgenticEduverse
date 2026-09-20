'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sparkles, Clock, Target, AlertTriangle, Crown, TrendingUp, Calculator, BookOpen, Globe, Code2, Languages } from 'lucide-react'
import AgentChat from '@/components/ai/AgentChat'
import TranslatorPanel from '@/components/ai/TranslatorPanel'
import CoinRewardToast from '@/components/coin-rewards/CoinRewardToast'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { api } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n'

/** The translator is not a chat companion - it gets its own panel instead of an AgentChat. */
const TRANSLATE_TAB = 'translate'

type SubjectNameKey =
  | 'tutor.subjectGeneral'
  | 'tutor.subjectMath'
  | 'tutor.subjectChinese'
  | 'tutor.subjectEnglish'
  | 'tutor.subjectCode'
  | 'tutor.subjectTranslate'

const SUBJECT_NAME_KEYS: Record<string, SubjectNameKey> = {
  general: 'tutor.subjectGeneral',
  math: 'tutor.subjectMath',
  chinese: 'tutor.subjectChinese',
  english: 'tutor.subjectEnglish',
  code: 'tutor.subjectCode',
  translate: 'tutor.subjectTranslate',
}

const subjectIcons: Record<string, React.ReactNode> = {
  general: <Sparkles className="h-4 w-4" />,
  math: <Calculator className="h-4 w-4" />,
  chinese: <BookOpen className="h-4 w-4" />,
  english: <Globe className="h-4 w-4" />,
  code: <Code2 className="h-4 w-4" />,
  translate: <Languages className="h-4 w-4" />,
}

const subjectEmoji: Record<string, string> = {
  general: '🤖',
  math: '📐',
  chinese: '📚',
  english: '🌍',
  code: '💻',
}

const TAB_ORDER = ['general', 'math', 'chinese', 'english', 'code', TRANSLATE_TAB] as const

export default function StudentTutorPage() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState('general')
  // The chat keeps pointing at the last real companion, so visiting 翻译 and coming back
  // does not reset the conversation it had already loaded.
  const [lastChatTab, setLastChatTab] = useState('general')
  const [weekStats, setWeekStats] = useState<{ studyMinutes: number; accuracy: number | null; weakPoints: string[]; coins: number } | null>(null)

  useEffect(() => { api.student.stats().then(setWeekStats).catch(() => setWeekStats(null)) }, [])
  useEffect(() => {
    if (activeTab !== TRANSLATE_TAB) setLastChatTab(activeTab)
  }, [activeTab])

  const isTranslator = activeTab === TRANSLATE_TAB
  const chatSubject = isTranslator ? lastChatTab : activeTab
  const subjectName = (key: string) => t(SUBJECT_NAME_KEYS[key] ?? 'tutor.subjectGeneral')

  return (
    <div className="light-ui min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="container">
      <CoinRewardToast />
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-purple-500" />
            {t('tutor.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('tutor.subtitle')}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <Tabs defaultValue="general" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mb-6 grid grid-cols-6 w-full max-w-3xl h-auto p-1.5">
          {TAB_ORDER.map((key) => (
            <TabsTrigger key={key} value={key} className="py-2 data-[state=active]:shadow-sm">
              <span className="flex items-center gap-1.5">
                {subjectIcons[key]}
                <span className="hidden sm:inline">{subjectName(key)}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4 order-2 lg:order-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  {t('tutor.weekStats')}
                </CardTitle>
                <CardDescription>{t('tutor.weekStatsDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <Avatar className="h-12 w-12 ring-2 ring-purple-200">
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-lg">
                      🤖
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{t('tutor.assistantName')}</p>
                    <Badge variant="outline" className="mt-0.5 h-5">{t('tutor.onDemand')}</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-blue-700">{t('tutor.studyMinutes')}</span>
                    </div>
                    <span className="font-bold text-blue-700">
                      {weekStats ? `${weekStats.studyMinutes} ${t('common.minutes')}` : t('common.noData')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-green-50">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">{t('tutor.accuracy')}</span>
                    </div>
                    <span className="font-bold text-green-700">
                      {weekStats?.accuracy === null || !weekStats ? t('common.noData') : `${weekStats.accuracy}%`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-600" />
                      <span className="text-sm text-amber-700">{t('common.coins')}</span>
                    </div>
                    <span className="font-bold text-amber-700">{weekStats?.coins ?? t('common.noData')}</span>
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-700">{t('tutor.weakPoints')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {weekStats?.weakPoints.map((wp, i) => (
                      <Badge key={i} variant="warning" className="text-xs">
                        {wp}
                      </Badge>
                    ))}
                    {(!weekStats || weekStats.weakPoints.length === 0) && <span className="text-xs text-slate-600">{t('tutor.noWeakPoints')}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('tutor.currentSubject')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                  <div className="h-10 w-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-purple-600">
                    {subjectIcons[activeTab]}
                  </div>
                  <div>
                    <p className="font-semibold">{subjectName(activeTab)}</p>
                    <p className="text-xs text-muted-foreground">{t('tutor.usesModel')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Both panels stay mounted and are simply hidden when inactive, so switching tabs
              never discards the chat conversation or the translator's last result. */}
          <div className={`lg:col-span-3 order-1 lg:order-2 ${isTranslator ? 'hidden' : ''}`}>
            <AgentChat
              agentId={chatSubject}
              agentLabel={t('tutor.companionLabel', { subject: subjectName(chatSubject) })}
              agentIcon={subjectEmoji[chatSubject] ?? '🤖'}
              welcomeMessage={
                chatSubject === 'general'
                  ? t('tutor.welcomeGeneral')
                  : t('tutor.welcome', { subject: subjectName(chatSubject) })
              }
              subject={chatSubject === 'general' ? undefined : subjectName(chatSubject)}
              showSidebar={false}
            />
          </div>

          <div className={`lg:col-span-3 order-1 lg:order-2 ${isTranslator ? '' : 'hidden'}`}>
            <TranslatorPanel />
          </div>
        </div>
      </Tabs>
      </div>
    </div>
  )
}
