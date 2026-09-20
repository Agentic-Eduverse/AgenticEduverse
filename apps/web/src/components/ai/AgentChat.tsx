'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { api, type TutorMessage, type TutorVideo } from '@/lib/api-client'
import { pickCloudModel, requestCloudTutor } from '@/lib/cloud-llm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader } from '@/components/ui/loader'
import { Send, Bot, MessageCircle, History, BookOpen, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { streamTutor } from '@/lib/tutor-stream-client'
import { FALLBACK_TUTOR_MODELS } from '@/lib/tutor-model-catalog'

/** A chat message plus the explanation videos attached to it. */
interface ChatMessage extends TutorMessage {
  clientKey: string
  interrupted?: boolean
  streaming?: boolean
  videos?: TutorVideo[]
  videosLoading?: boolean
  videosDismissed?: boolean
}

/** How many videos to offer under each answer. */
const VIDEO_LIMIT = 5

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * The search term for the video lookup: the model's own knowledge-point wording when it gave
 * one, otherwise the student's question with any companion prefix stripped. Capped because the
 * upstream search page is queried as a plain keyword.
 */
function buildVideoQuery(preferred: string | undefined, question: string): string {
  const fallback = question.replace(/^\[[^\]]*\]\s*/, '')
  return (preferred?.trim() || fallback).replace(/\s+/g, ' ').trim().slice(0, 40)
}

export interface AgentChatProps {
  agentLabel: string
  /** Which companion this chat belongs to - conversations and history are kept per companion. */
  agentId?: string
  agentIcon?: string
  endpoint?: string
  welcomeMessage?: string
  subject?: string
  context?: string
  messagePrefix?: string
  showSidebar?: boolean
}

export default function AgentChat({
  agentLabel,
  agentId = 'general',
  agentIcon = '🤖',
  welcomeMessage = '你好！我是你的 AI 学伴，有任何问题都可以问我哦😊',
  subject,
  context,
  messagePrefix,
  showSidebar = true,
}: AgentChatProps) {
  const { t, locale } = useI18n()
  const modelLabels = ({ 'zh-CN': ['模型', '刷新列表', '备用模型列表（可用性待验证）', '正在获取模型', '未配置 ZenMux Key'], en: ['Model', 'Refresh', 'Fallback list (availability unverified)', 'Loading models', 'ZenMux key not configured'], de: ['Modell', 'Aktualisieren', 'Ersatzliste (nicht geprüft)', 'Modelle laden', 'ZenMux-Schlüssel fehlt'], fr: ['Modèle', 'Actualiser', 'Liste de secours (non vérifiée)', 'Chargement', 'Clé ZenMux absente'], it: ['Modello', 'Aggiorna', 'Elenco di riserva (non verificato)', 'Caricamento', 'Chiave ZenMux assente'], ru: ['Модель', 'Обновить', 'Резервный список (не проверен)', 'Загрузка моделей', 'Нет ключа ZenMux'], es: ['Modelo', 'Actualizar', 'Lista alternativa (sin verificar)', 'Cargando modelos', 'Falta la clave ZenMux'], ja: ['モデル', '更新', '予備リスト（利用可否未確認）', '読み込み中', 'ZenMux キー未設定'] } as Record<string, string[]>)[locale] || ['模型', '刷新列表', '备用模型列表（可用性待验证）', '正在获取模型', '未配置 ZenMux Key']
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; name: string }>>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelSource, setModelSource] = useState('')
  const [modelEnabled, setModelEnabled] = useState(false)
  const refreshModels = async () => {
    setModelsLoading(true)
    try {
      const r = await fetch('/api/ai/tutor/models', { cache: 'no-store' })
      if (!r.ok) throw new Error('MODEL_LIST_FAILED')
      const { data } = await r.json()
      setModelOptions(data.models)
      setModelSource(data.source)
      setModelEnabled(data.enabled)
      let stored = ''
      try { stored = localStorage.getItem('eduverse_tutor_model') || '' } catch {}
      setSelectedModel(current => [current, stored, data.defaultModel].find(id => data.models.some((m: { id: string }) => m.id === id)) || data.models[0]?.id || '')
    } catch {
      setModelOptions(FALLBACK_TUTOR_MODELS)
      setModelSource('fallback')
      setSelectedModel(current => FALLBACK_TUTOR_MODELS.some(m => m.id === current) ? current : FALLBACK_TUTOR_MODELS[0].id)
    } finally { setModelsLoading(false) }
  }
  useEffect(() => { void refreshModels() }, [])
  // One conversation per companion. Switching companions swaps the visible thread instead
  // of carrying the previous one across, and coming back restores what was there.
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({})
  const fallbackMessages = useMemo<ChatMessage[]>(
    () => [{ role: 'assistant', content: welcomeMessage, clientKey: 'welcome' }],
    [welcomeMessage]
  )
  const messages = messagesByAgent[agentId] ?? fallbackMessages
  // Replies are patched by client key rather than index so an in-flight video lookup still
  // lands on the right message after the student keeps chatting or switches companion.
  const appendMessages = (items: ChatMessage[], agent: string = agentId) =>
    setMessagesByAgent((prev) => ({
      ...prev,
      [agent]: [...(prev[agent] ?? fallbackMessages), ...items],
    }))
  const patchMessage = (agent: string, key: string, patch: Partial<ChatMessage>) =>
    setMessagesByAgent((prev) => {
      const thread = prev[agent]
      if (!thread) return prev
      return { ...prev, [agent]: thread.map((item) => (item.clientKey === key ? { ...item, ...patch } : item)) }
    })
  const replaceMessages = (items: TutorMessage[]) =>
    setMessagesByAgent((prev) => ({
      ...prev,
      [agentId]: items.map((item) => ({ ...item, clientKey: makeKey() })),
    }))
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => () => { requestRef.current?.abort() }, [])
  const activeAgentRef = useRef(agentId)
  activeAgentRef.current = agentId
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // Two independent channels back this chat: the server-side provider (AI_BASE_URL /
  // AI_MODEL / AI_API_KEY) and the keyless in-browser WorkBuddy cloud channel.
  // The tutor is usable as long as either one is available.
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null)
  const [cloudReady, setCloudReady] = useState<boolean | null>(null)
  const [history, setHistory] = useState<Array<{
    userMessage: string
    subject: string | null
    response: { answer: string; practiceExercises?: Array<{ question: string; options?: string[]; answer: string; explanation: string }> }
    timestamp: string
  }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  useEffect(() => {
    api.ai.status().then((status) => setServerConfigured(status.tutorConfigured ?? status.configured)).catch(() => setServerConfigured(false))
    // Resolving a model id doubles as the availability probe for the cloud channel.
    pickCloudModel()
      .then(() => setCloudReady(true))
      .catch((error) => {
        console.error('[AgentChat] cloud channel unavailable:', error)
        setCloudReady(false)
      })
  }, [])

  // History belongs to a single companion, so reload it whenever the companion changes -
  // and clear the thread's draft so nothing leaks from the previous one.
  useEffect(() => {
    let cancelled = false
    setHistory([])
    setInput('')
    api.tutor
      .history(agentId)
      .then((entries) => {
        if (!cancelled) setHistory(entries)
      })
      .catch(() => {
        if (!cancelled) setHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  const aiAvailable = serverConfigured === true || cloudReady === true
  // Still probing while a channel has not answered yet; "blocked" means every channel
  // has answered and none of them works.
  const aiChecking = !aiAvailable && (serverConfigured === null || cloudReady === null)
  const aiBlocked = serverConfigured === false && cloudReady === false

  /**
   * Looks up explanation videos for a knowledge point and attaches them to one message.
   * Deliberately fire-and-forget: a slow or failing video source must never delay or spoil
   * the answer the student already has.
   */
  const loadVideos = async (agent: string, key: string, query: string) => {
    if (query.replace(/[\s?？。，,、!！]/g, '').length < 2) return
    patchMessage(agent, key, { videosLoading: true })
    try {
      const videos = await api.tutor.videos(query)
      patchMessage(agent, key, { videos: videos.slice(0, VIDEO_LIMIT), videosLoading: false })
    } catch (error) {
      console.warn('[AgentChat] video lookup failed:', error)
      patchMessage(agent, key, { videos: [], videosLoading: false })
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    if (aiBlocked) {
      toast.error(t('agentChat.notReady'))
      return
    }

    const userMessage: TutorMessage = {
      role: 'user',
      content: messagePrefix ? `[${messagePrefix}] ${input.trim()}` : input.trim(),
    }

    appendMessages([{ ...userMessage, clientKey: makeKey() }])
    setInput('')
    setLoading(true)

    // Captured so the video lookup still targets the right thread if the student switches
    // companion while it is in flight.
    const threadAgent = agentId
    let videoKeyword: string | undefined
    const assistantKey = makeKey()
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 130000)
    appendMessages([{ role: 'assistant', content: '', clientKey: assistantKey, streaming: true }], threadAgent)
    const onAnswer = (text: string) => patchMessage(threadAgent, assistantKey, { content: text })
    const priorMessages = messages.filter(m => !m.interrupted && !m.streaming)

    try {
      let response: TutorMessage

      if (serverConfigured) {
        response = await streamTutor({
          messages: [...priorMessages, userMessage],
          subject,
          agentId,
          model: modelEnabled ? selectedModel || undefined : undefined,
          context,
        }, onAnswer, controller.signal)
        videoKeyword = response.videoKeywords?.[0]
      } else {
        // Cloud channel: the browser talks to the model service directly, so the
        // server-side memory write happens afterwards through a plain save endpoint.
        const priorTurns = priorMessages
          .slice(1)
          .filter((item) => item.role === 'user' || item.role === 'assistant')
          .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content }))

        const result = await requestCloudTutor({
          message: userMessage.content,
          history: priorTurns,
          subject,
          onAnswer,
          signal: controller.signal,
        })

        response = {
          role: 'assistant',
          content: result.answer,
          practiceProblem: result.practiceExercises?.[0],
        }
        videoKeyword = result.videoKeywords?.[0]

        api.tutor
          .saveHistory({
            agentId,
            userMessage: userMessage.content,
            subject,
            response: { answer: result.answer, practiceExercises: result.practiceExercises },
          })
          .catch(() => {
            // Losing the history entry must not discard the reply already rendered.
          })
      }

      patchMessage(threadAgent, assistantKey, { ...response, streaming: false })
      if (activeAgentRef.current === threadAgent) setHistory((prev) => [...prev, {
        userMessage: userMessage.content,
        subject: subject || null,
        response: {
          answer: response.content,
          practiceExercises: response.practiceProblem ? [response.practiceProblem] : undefined,
        },
        timestamp: new Date().toISOString(),
      }].slice(-50))

      void loadVideos(threadAgent, assistantKey, buildVideoQuery(videoKeyword, userMessage.content))
    } catch (error) {
      patchMessage(threadAgent, assistantKey, { streaming: false, interrupted: true })
      toast.error(
        error instanceof Error && error.message === 'INVALID_TUTOR_RESPONSE'
          ? t('agentChat.invalidResponse')
          : t('agentChat.replyFailed')
      )
    } finally {
      clearTimeout(timeout)
      requestRef.current = null
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const getInitials = (name: string, role: string) => {
    if (role === 'assistant') return agentIcon
    return name.slice(0, 1).toUpperCase()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
      {showSidebar && (
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('agentChat.history')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {history.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">{t('agentChat.noHistory')}</p>
              )}
              {history.slice().reverse().map((entry) => (
                <button
                  key={`${entry.timestamp}-${entry.userMessage}`}
                  type="button"
                  onClick={() => replaceMessages([
                    { role: 'assistant', content: welcomeMessage },
                    { role: 'user', content: entry.userMessage },
                    {
                      role: 'assistant',
                      content: entry.response.answer,
                      practiceProblem: entry.response.practiceExercises?.[0],
                    },
                  ])}
                  className="w-full text-left p-2 rounded-lg hover:bg-accent/50 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.userMessage}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className={`${showSidebar ? 'lg:col-span-3' : 'lg:col-span-4'} flex flex-col h-[70vh]`}>
        <CardHeader className="border-b pb-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 min-w-0">
              <span>{modelLabels[0]}</span>
              <select aria-label={modelLabels[0]} value={selectedModel} disabled={loading || modelsLoading || !modelEnabled} onChange={event => {
                setSelectedModel(event.target.value)
                try { localStorage.setItem('eduverse_tutor_model', event.target.value) } catch {}
              }} className="max-w-[260px] rounded-md border bg-background px-2 py-1 text-foreground">
                {modelOptions.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" disabled={modelsLoading || loading} onClick={() => void refreshModels()}>{modelLabels[1]}</Button>
            <span className="text-xs text-muted-foreground">{modelsLoading ? modelLabels[3] : !modelEnabled ? modelLabels[4] : modelSource === 'fallback' ? modelLabels[2] : 'ZenMux'}</span>
          </div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm">
                {agentIcon}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span>{agentLabel}</span>
                <Badge variant={aiAvailable ? 'success' : 'secondary'} className="gap-1 h-5">
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  {aiChecking ? t('agentChat.statusChecking') : aiAvailable ? t('agentChat.statusReady') : t('agentChat.statusMissing')}
                </Badge>
              </div>
            </div>
            {subject && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {subject}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
          {messages.map((msg, idx) => (
            <div key={msg.clientKey || idx}>
              <div
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback
                    className={`${
                      msg.role === 'assistant'
                        ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                        : 'bg-blue-100 text-blue-700'
                    } text-sm`}
                  >
                    {getInitials(msg.role === 'user' ? t('agentChat.me') : agentLabel, msg.role)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`rounded-lg p-4 shadow-sm max-w-[80%] border ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-tr-none border-blue-400'
                      : 'bg-white rounded-tl-none'
                  }`}
                >
                  {msg.content ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                      {msg.streaming && <span aria-label={t('agentChat.generating')} className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />}
                    </p>
                  ) : msg.streaming ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader size="sm" />{t('agentChat.thinking')}</div>
                  ) : null}
                  {msg.interrupted && <p className="mt-2 border-t pt-2 text-xs text-red-600">{t('agentChat.interrupted')}</p>}
                </div>
              </div>
              {msg.practiceProblem && (
                <div className="mt-3 ml-11 mr-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="h-4 w-4 text-amber-600" />
                      <span className="font-semibold text-amber-700 text-sm">{t('agentChat.exercise')}</span>
                    </div>
                    <p className="text-sm mb-3 font-medium">{msg.practiceProblem.question}</p>
                    {msg.practiceProblem.options && (
                      <div className="space-y-1.5 mb-3">
                        {msg.practiceProblem.options.map((opt, i) => (
                          <div
                            key={i}
                            className="text-sm p-2 rounded bg-white border border-amber-100"
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    <details className="text-sm">
                      <summary className="cursor-pointer text-amber-700 font-medium hover:underline">
                        {t('agentChat.showAnswer')}
                      </summary>
                      <div className="mt-2 space-y-1">
                        <p>
                          <span className="font-medium">{t('agentChat.answer')}</span>
                          {msg.practiceProblem.answer}
                        </p>
                        <p className="text-muted-foreground">
                          <span className="font-medium">{t('agentChat.explanation')}</span>
                          {msg.practiceProblem.explanation}
                        </p>
                      </div>
                    </details>
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && !msg.videosDismissed && (msg.videosLoading || (msg.videos?.length ?? 0) > 0) && (
                <div className="mt-3 ml-11 mr-3">
                  <div className="overflow-hidden rounded-lg border bg-white">
                    <div className="flex items-center gap-2 border-b px-4 py-2">
                      <Video className="h-4 w-4 text-rose-500" />
                      <span className="text-sm font-semibold">{t('agentChat.videos')}</span>
                      <button
                        type="button"
                        aria-label={t('agentChat.videosDismiss')}
                        title={t('agentChat.videosDismiss')}
                        onClick={() => patchMessage(agentId, msg.clientKey, { videosDismissed: true })}
                        className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {msg.videosLoading && !msg.videos?.length ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader size="sm" />
                        {t('agentChat.videosLoading')}
                      </div>
                    ) : (
                      <>
                        <ul className="divide-y">
                          {msg.videos?.map((video) => (
                            <li key={video.id}>
                              <a
                                href={video.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                              >
                                {video.cover ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={video.cover}
                                    alt=""
                                    loading="lazy"
                                    className="h-14 w-24 shrink-0 rounded bg-muted object-cover"
                                  />
                                ) : (
                                  <span className="h-14 w-24 shrink-0 rounded bg-muted" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="line-clamp-2 block text-sm font-medium leading-snug">{video.title}</span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {[video.author, video.duration].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                        <p className="border-t px-4 py-2 text-xs text-muted-foreground">{t('agentChat.videosHint')}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('agentChat.inputPlaceholder')}
              rows={1}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || aiBlocked}
            />
            <Button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim() || aiBlocked}
              className="h-10"
            >
              {loading ? <Loader size="sm" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
