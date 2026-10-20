type JsonRecord = Record<string, unknown>

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function httpsUrl(value: unknown) {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash } catch { return false }
}

function strings(value: JsonRecord, keys: readonly string[]) {
  return keys.every((key) => typeof value[key] === 'string')
}

export function ownDataMetadata(value: unknown): JsonRecord {
  if (!record(value)) return {}
  const meta: JsonRecord = {}
  if (value.environment === 'test' || value.environment === 'live') meta.environment = value.environment
  const quota = value.quota
  if (record(quota) && integer(quota.limit, 1) && integer(quota.used, 0) && integer(quota.remaining, 0)
    && quota.used <= quota.limit && quota.remaining === quota.limit - quota.used
    && integer(quota.resetAfter, 1) && typeof quota.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(quota.day)) {
    meta.quota = { limit: quota.limit, used: quota.used, remaining: quota.remaining, day: quota.day, resetAfter: quota.resetAfter }
  }
  const accounting = value.accounting
  if (record(accounting) && typeof accounting.alreadyConsulted === 'boolean' && typeof accounting.charged === 'boolean') {
    meta.accounting = {
      alreadyConsulted: accounting.alreadyConsulted,
      charged: accounting.charged,
      ...(typeof accounting.cacheEnabled === 'boolean' ? { cacheEnabled: accounting.cacheEnabled } : {}),
    }
  }
  const provenance = value.provenance
  if (record(provenance) && provenance.source === 'dnit_official_snapshot'
    && strings(provenance, ['sourcePage', 'publicationDate', 'publishedText', 'importedAt', 'snapshotHash'])
    && httpsUrl(provenance.sourcePage)
    && Number.isFinite(Date.parse(provenance.importedAt as string))
    && /^\d{4}-\d{2}-\d{2}$/.test(provenance.publicationDate as string)
    && /^[0-9a-f]{64}$/.test(provenance.snapshotHash as string)) {
    meta.provenance = {
      source: provenance.source, sourcePage: provenance.sourcePage, publicationDate: provenance.publicationDate,
      publishedText: provenance.publishedText, importedAt: provenance.importedAt, snapshotHash: provenance.snapshotHash,
    }
  }
  return meta
}

export async function readBoundedJson(response: Response, signal: AbortSignal): Promise<JsonRecord> {
  if (!response.body) throw new Error('Missing body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  let abort: () => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    abort = () => { void reader.cancel().catch(() => {}); reject(new Error('Timeout')) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), aborted])
      if (done) break
      size += value.byteLength
      if (size > 65_536) throw new Error('Response too large')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const parsed: unknown = JSON.parse(text)
    if (!record(parsed)) throw new Error('Invalid response')
    return parsed
  } catch (cause) {
    void reader.cancel().catch(() => {})
    throw cause
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}
