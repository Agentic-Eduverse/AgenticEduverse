export async function consumeSSE(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  function line(value: string) {
    if (!value) {
      if (data.length) onData(data.join('\n'))
      data = []
    } else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
  }
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, index).replace(/\r$/, ''))
        buffer = buffer.slice(index + 1)
      }
      if (chunk.done) break
    }
    if (buffer) line(buffer.replace(/\r$/, ''))
    line('')
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
