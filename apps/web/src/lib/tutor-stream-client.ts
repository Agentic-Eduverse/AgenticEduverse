import type { TutorMessage } from './api-client'
export async function streamTutor(body: { messages: TutorMessage[]; subject?: string; agentId?: string; context?: string; model?: string }, onAnswer: (text: string) => void, callerSignal: AbortSignal): Promise<TutorMessage> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  callerSignal.addEventListener('abort', abort, { once: true })
  if (callerSignal.aborted) controller.abort()
  const timeout = setTimeout(abort, 130000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const index = body.messages.map(m => m.role).lastIndexOf('user')
    const res = await fetch('/api/ai/tutor', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream: true,
        message: body.messages[index]?.content, history: body.messages.slice(0, index).map(({role,content}) => ({role,content})),
        subject: body.subject, agentId: body.agentId, contextClassId: body.context, model: body.model,
      }) })
    if (!res.ok) throw new Error('TUTOR_REQUEST_FAILED')
    if (!res.body || !res.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('INVALID_STREAM')
    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: TutorMessage | undefined
    const line = (value: string) => {
      if (!value.trim()) return
      const event = JSON.parse(value)
      if (event.type === 'error') throw new Error('TUTOR_STREAM_INTERRUPTED')
      if (event.type === 'answer' && typeof event.text === 'string') onAnswer(event.text)
      if (event.type === 'complete' && typeof event.tutor?.answer === 'string') {
        if (!event.saved) console.warn('Tutor reply received, but history was not saved.')
        result = { role: 'assistant', content: event.tutor.answer, practiceProblem: event.tutor.practiceExercises?.[0], videoKeywords: event.tutor.videoKeywords }
      }
    }
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      let pos: number
      while ((pos = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, pos)); buffer = buffer.slice(pos + 1) }
      if (chunk.done) break
    }
    line(buffer)
    if (!result) throw new Error('TUTOR_STREAM_INTERRUPTED')
    return result
  } finally {
    clearTimeout(timeout); callerSignal.removeEventListener('abort', abort)
    await reader?.cancel().catch(() => undefined)
    reader?.releaseLock()
  }
}
