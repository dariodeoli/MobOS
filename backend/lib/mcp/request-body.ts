/** Read a request body with a hard byte limit. The reader is cancelled as soon
 * as the limit is exceeded so chunked callers cannot force an unbounded buffer. */
export async function readBoundedBody(request: Request, maxBytes: number, deadlineMs = 10_000): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') || '')
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!request.body) return ''
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error('invalid_body_limit')
  const reader = request.body.getReader()
  let timeout: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => {
    reject(new Error('request_body_timeout'))
    void reader.cancel('request_body_timeout').catch(() => undefined)
  }, deadlineMs) })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline])
      if (part.done) break
      total += part.value.byteLength
      if (total > maxBytes) {
        void reader.cancel('request_too_large').catch(() => undefined)
        return null
      }
      chunks.push(part.value)
    }
  } finally { clearTimeout(timeout!); reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}
