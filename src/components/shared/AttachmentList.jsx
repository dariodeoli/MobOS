import { useCallback, useEffect, useId, useState } from 'react'
import { API_URL, api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, ConfirmDialog, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Visor y carga de adjuntos genéricos de un documento dueño (entity+entityId).
// Reutiliza las reglas de AttachmentInput (JPG/PNG/WebP/PDF ≤5 MiB) y el
// endpoint /api/attachments, que audita cada alta y baja.
export function pesoArchivo(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const iconoDe = (mimeType) => (String(mimeType || '').startsWith('image/') ? 'image' : 'receipt')

export default function AttachmentList({ entity, entityId, puedeSubir = false, titulo = 'Adjuntos', className }) {
  const inputId = useId()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aEliminar, setAEliminar] = useState(null)

  const cargar = useCallback(async () => {
    if (isDemoRuntime || !entity || !entityId) { setItems([]); return }
    setLoading(true); setError('')
    try { setItems(await api.get(`/api/attachments?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`) || []) }
    catch (cause) { setError(cause?.message || 'No se pudieron cargar los adjuntos.') }
    finally { setLoading(false) }
  }, [entity, entityId])
  useEffect(() => { cargar() }, [cargar])

  async function subir(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.append('entity', entity); body.append('entityId', entityId); body.append('file', file)
      await api.post('/api/attachments', body)
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo subir el adjunto.') } finally { setBusy(false) }
  }

  async function descargar(item) {
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/attachments/${encodeURIComponent(item.id)}/download`, { credentials: 'include' })
      if (!response.ok) throw new Error('No se pudo descargar el adjunto.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.fileName || 'adjunto'
      link.click()
    } catch (cause) { setError(cause?.message || 'No se pudo descargar el adjunto.') }
  }

  async function eliminar() {
    if (!aEliminar) return
    setBusy(true); setError('')
    try {
      await api.delete(`/api/attachments?id=${encodeURIComponent(aEliminar.id)}`)
      setAEliminar(null)
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar el adjunto.') } finally { setBusy(false) }
  }

  if (isDemoRuntime || !entity || !entityId) return null

  return (
    <section className={className}>
      <header className="flex items-center justify-between gap-2">
        <h4 className={cn('flex items-center gap-2', ROTULO_SECCION)}><Icon name="image" className="h-4 w-4" />{titulo}</h4>
        {items.length > 0 && <Badge color="slate">{items.length}</Badge>}
      </header>
      {loading ? <Skeleton className="mt-2 h-10 w-full" /> : items.length === 0 ? (
        <p className="mt-2 text-xs text-mute">Sin adjuntos.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-2">
              <Icon name={iconoDe(item.mimeType)} className="h-4 w-4 shrink-0 text-mute" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{item.fileName}</b>
                <span className="mt-0.5 block truncate text-[11px] text-mute">{pesoArchivo(item.sizeBytes)} · {item.createdAt ? new Date(item.createdAt).toLocaleString('es-PY') : ''}{item.uploadedBy?.name ? ` · ${item.uploadedBy.name}` : ''}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => descargar(item)}>
                  <Icon name="download" className="h-3.5 w-3.5" />Descargar
                </Button>
                {puedeSubir && (
                  <Button type="button" variant="ghost" className="h-8 px-2 text-xs" aria-label={`Eliminar ${item.fileName}`} disabled={busy} onClick={() => setAEliminar(item)}>
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {puedeSubir && (
        <label htmlFor={inputId} className="mt-3 block text-xs text-mute">
          Adjuntar JPG, PNG, WebP o PDF · hasta 5 MiB
          <AttachmentInput id={inputId} className="mt-2 block w-full text-xs" disabled={busy} onSelect={subir} onError={setError} />
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
      <ConfirmDialog
        open={aEliminar !== null}
        onCancel={() => setAEliminar(null)}
        onConfirm={eliminar}
        title="Eliminar adjunto"
        description={`Vas a eliminar ${aEliminar?.fileName || 'el adjunto'}. La acción queda auditada.`}
        confirmLabel="Eliminar"
        variant="danger"
        busy={busy}
      />
    </section>
  )
}
