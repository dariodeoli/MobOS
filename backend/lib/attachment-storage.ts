import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Almacenamiento de adjuntos fuera de Postgres.
//
// MOBOS_STORAGE_DIR apunta a un volumen persistente (por ejemplo
// /var/lib/mobos/attachments). Cuando está configurado, cada adjunto se guarda
// como ${dir}/${tenantId}/${area}/${uuid}${ext} y en la base solo queda el
// `storageKey` relativo (tenantId/area/archivo). Si la variable está vacía el
// módulo no toca el disco: devuelve storageKey null y el llamador conserva el
// comportamiento actual de guardar los bytes en la columna `data` (ByteA).
//
// Compatibilidad hacia atrás: los registros viejos siguen teniendo sus bytes en
// `data`; readAttachment cae a `data` cuando no hay storageKey o cuando el
// archivo ya no existe en el volumen (volumen perdido o adjunto migrado a mano).
// Por eso toda escritura conserva además `data` como respaldo.

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9._-]{1,160}$/

type AttachmentRecord = { storageKey?: string | null; data: Uint8Array | Buffer }

export function attachmentStorageDir() {
  return (process.env.MOBOS_STORAGE_DIR || '').trim()
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'general'
}

function fileExtension(fileName: string) {
  const extension = path.extname(fileName.replace(/\\/g, '/').split('/').pop() || '').toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.bin'
}

function resolveStoredPath(storageKey: string) {
  const dir = attachmentStorageDir()
  if (!dir || !STORAGE_KEY_PATTERN.test(storageKey)) return null
  const target = path.resolve(dir, storageKey)
  const root = path.resolve(dir)
  if (target !== root && !target.startsWith(root + path.sep)) return null
  return target
}

export async function saveAttachment({ tenantId, area, fileName, data }: { tenantId: string; area: string; fileName: string; mimeType: string; sha256: string; data: Uint8Array | Buffer }): Promise<{ storageKey: string | null }> {
  const dir = attachmentStorageDir()
  if (!dir) return { storageKey: null }
  const relativeKey = `${safeSegment(tenantId)}/${safeSegment(area)}/${randomUUID()}${fileExtension(fileName)}`
  const target = path.resolve(dir, relativeKey)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, data)
  return { storageKey: relativeKey }
}

export async function readAttachment(record: AttachmentRecord): Promise<Uint8Array<ArrayBuffer>> {
  if (record.storageKey) {
    const target = resolveStoredPath(record.storageKey)
    if (target) {
      try {
        return new Uint8Array(await readFile(target))
      } catch {
        // Archivo ausente: se conserva la copia en base como respaldo.
      }
    }
  }
  return new Uint8Array(record.data)
}

export async function deleteAttachment(record: { storageKey?: string | null } | null | undefined) {
  if (!record?.storageKey) return
  const target = resolveStoredPath(record.storageKey)
  if (!target) return
  try {
    await unlink(target)
  } catch {
    // Best-effort: un adjunto ya ausente no interrumpe el borrado lógico.
  }
}
