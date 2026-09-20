/** Extracts the currently available `answer` JSON string from a partial model response. */
export function extractPartialAnswer(source: string): { value: string; complete: boolean } | null {
  const key = source.match(/"answer"\s*:\s*"/)
  if (!key || key.index == null) return null
  let i = key.index + key[0].length
  let value = ''
  while (i < source.length) {
    const ch = source[i++]
    if (ch === '"') return { value, complete: true }
    if (ch !== '\\') { value += ch; continue }
    if (i >= source.length) return { value, complete: false }
    const escaped = source[i++]
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
    if (escaped === 'u') {
      if (i + 4 > source.length) return { value, complete: false }
      const hex = source.slice(i, i + 4)
      if (!/^[0-9a-f]{4}$/i.test(hex)) return { value, complete: false }
      value += String.fromCharCode(parseInt(hex, 16)); i += 4
    } else value += simple[escaped] ?? escaped
  }
  return { value, complete: false }
}
