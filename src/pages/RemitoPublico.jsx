import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { pesoArchivo } from '@/components/shared/AttachmentList'
import AttachmentInput from '@/components/shared/AttachmentInput'
import Icon from '@/components/shared/Icon'
import { Aviso, Textarea } from '@/components/ui'
import { ROTULO_SECCION } from '@/components/shared/tabla'

// Remito público de traslado: el destino abre el QR impreso, controla los
// IMEI/seriales, saca la foto del remito y confirma la recepción sin sesión.
// La confirmación es única: después solo se consulta.
export default function RemitoPublico() {
  const { token } = useParams()
  const [remito, setRemito] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [nota, setNota] = useState('')
  const [confirmados, setConfirmados] = useState({})

  useEffect(() => {
    let active = true
    setError(''); setNotice(''); setRemito(null); setConfirmados({}); setNota('')
    fetch(`${API_URL}/api/transfers/public/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Remito no encontrado.'); if (!active) return; setRemito(payload); setConfirmados(Object.fromEntries(clavesDeConfirmacion(payload).map(clave => [clave, true]))) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar el remito.') })
    return () => { active = false }
  }, [token])

  const pendientes = useMemo(() => Object.entries(confirmados).filter(([, valor]) => !valor).map(([clave]) => clave), [confirmados])
  const recibido = remito?.status === 'RECEIVED'

  async function recibir() {
    if (busy || pendientes.length) return
    setBusy(true); setError('')
    try {
      const seriales = (remito?.lines || []).flatMap(line => Array.isArray(line.serials) ? line.serials : [])
      const response = await fetch(`${API_URL}/api/transfers/public/${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receive', ...(nota.trim() ? { note: nota.trim() } : {}), ...(seriales.length ? { serialsOk: seriales } : {}) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo registrar la recepción.')
      setNotice('Recepción registrada. El stock del destino ya está actualizado.')
      setRemito(current => current ? { ...current, status: 'RECEIVED', receivedAt: payload.receivedAt, receivedNote: nota.trim() || null } : current)
    } catch (cause) {
      setError(cause?.message || 'No se pudo registrar la recepción.')
    } finally {
      setBusy(false)
    }
  }

  async function subirFoto(file) {
    if (!file || subiendo) return
    setSubiendo(true); setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`${API_URL}/api/transfers/public/${encodeURIComponent(token || '')}/attachments`, { method: 'POST', body })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo subir la foto.')
      setRemito(current => current ? { ...current, photos: [payload, ...(current.photos || [])] } : current)
      setNotice('Foto del remito adjuntada.')
    } catch (cause) {
      setError(cause?.message || 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  const urlFoto = (id) => `${API_URL}/api/transfers/public/${encodeURIComponent(token || '')}/attachments?id=${encodeURIComponent(id)}`

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Remito de traslado</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{remito ? `${remito.sourceBranch?.name || 'Origen'} → ${remito.destinationBranch?.name || 'Destino'}` : 'Remito'}</h1>
          {remito?.createdAt && <p className="mt-1 text-sm text-mute">Enviado el {new Date(remito.createdAt).toLocaleString('es-PY')}</p>}
        </header>

        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}
        {notice && <Aviso tono="ok" className="px-4 py-3 text-sm rounded-xl text-center">{notice}</Aviso>}

        {remito && (
          <div className="mt-4 space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={ROTULO_SECCION}>Estado</p>
                  <p className={`mt-1 font-bold ${recibido ? 'text-ok' : 'text-warn'}`}>{recibido ? 'Recibido' : 'En camino'}</p>
                </div>
                {recibido && (
                  <p className="text-right text-xs text-mute">
                    {remito.receivedAt ? new Date(remito.receivedAt).toLocaleString('es-PY') : ''}
                    {remito.receivedBy ? ` · ${remito.receivedBy}` : ''}
                  </p>
                )}
              </div>
              {remito.aexGuide && <p className="mt-3 font-mono text-xs text-fono-light">Guía AEX: {remito.aexGuide}</p>}
              {remito.notes && <p className="mt-3 text-sm text-mute">{remito.notes}</p>}
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Unidades del remito</h2>
              <p className="mt-1 text-xs text-mute">{recibido ? 'Unidades confirmadas al recibir.' : 'Destildá solo lo que no llegó: la recepción se confirma con todo lo despachado.'}</p>
              <div className="mt-3 space-y-3">
                {(remito.lines || []).map((line, index) => {
                  const seriales = Array.isArray(line.serials) ? line.serials : []
                  if (!seriales.length) {
                    const clave = `line-${line.id || index}`
                    return (
                      <label key={clave} className="flex items-center gap-3 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-fono" checked={Boolean(confirmados[clave])} disabled={recibido} onChange={event => setConfirmados(current => ({ ...current, [clave]: event.target.checked }))} />
                        <span className="min-w-0 flex-1">{line.productName} × {line.quantity}</span>
                      </label>
                    )
                  }
                  return (
                    <div key={line.id || index} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                      <p className="font-semibold">{line.productName} × {line.quantity}</p>
                      <div className="mt-2 space-y-1.5">
                        {seriales.map(serial => (
                          <label key={serial} className="flex items-center gap-3">
                            <input type="checkbox" className="h-4 w-4 accent-fono" checked={Boolean(confirmados[serial])} disabled={recibido} onChange={event => setConfirmados(current => ({ ...current, [serial]: event.target.checked }))} />
                            <span className="font-mono text-xs text-mute">{serial}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {!recibido && pendientes.length > 0 && <p className="mt-3 text-xs text-warn">{pendientes.length} unidad{pendientes.length === 1 ? '' : 'es'} sin confirmar. Revisá el remito o destildá solo si falta algo.</p>}
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Foto del remito</h2>
              <p className="mt-1 text-xs text-mute">Adjuntá la foto del remito firmado o del paquete recibido.</p>
              <div className="mt-3">
                <AttachmentInput className="block w-full text-xs" disabled={subiendo || recibido} onSelect={subirFoto} onError={setError} />
              </div>
              {subiendo && <p className="mt-2 text-xs text-mute">Subiendo foto…</p>}
              {(remito.photos || []).length > 0 && (
                <ul className="mt-3 space-y-2">
                  {(remito.photos || []).map(photo => (
                    <li key={photo.id} className="flex items-center gap-3 rounded-lg border border-ink-600 px-3 py-2">
                      {String(photo.mimeType || '').startsWith('image/')
                        ? <a href={urlFoto(photo.id)} target="_blank" rel="noreferrer"><img src={urlFoto(photo.id)} alt={photo.fileName} className="h-14 w-14 rounded-lg object-cover" /></a>
                        : <Icon name="receipt" className="h-5 w-5 shrink-0 text-mute" />}
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px]">{photo.fileName}</b>
                        <span className="text-[11px] text-mute">{pesoArchivo(photo.sizeBytes)} · {photo.createdAt ? new Date(photo.createdAt).toLocaleString('es-PY') : ''}</span>
                      </span>
                      <a className="shrink-0 rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore" href={urlFoto(photo.id)} target="_blank" rel="noreferrer">Ver</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {recibido ? (
              <section className="rounded-2xl border border-ok/25 bg-ok/5 p-5 text-center text-sm text-ok">
                Recepción confirmada{remito.receivedNote ? ` · Nota: ${remito.receivedNote}` : ''}.
              </section>
            ) : (
              <section className="rounded-2xl border border-fono/30 bg-fono/5 p-5">
                <label className="block text-xs text-mute">Nota de recepción (opcional)
                  <Textarea rows={2} maxLength={500} value={nota} onChange={event => setNota(event.target.value)} className="mt-1.5 rounded-xl px-3 py-2 text-sm" placeholder="Ej: llegó completo, caja golpeada, falta un cargador…" />
                </label>
                <button type="button" disabled={busy || pendientes.length > 0} onClick={recibir} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ok px-5 py-2.5 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                  <Icon name="check" className="h-4 w-4" />{busy ? 'Registrando…' : 'Confirmar recepción'}
                </button>
              </section>
            )}

            <p className="pt-2 text-center text-[11px] text-mute">Documento no fiscal · Generado por MobOS</p>
          </div>
        )}
      </div>
    </main>
  )
}

// Claves de confirmación del remito: un serial por unidad y una clave por
// línea sin seriales.
function clavesDeConfirmacion(remito) {
  const claves = []
  for (const [index, line] of (remito?.lines || []).entries()) {
    const seriales = Array.isArray(line.serials) ? line.serials : []
    if (seriales.length) claves.push(...seriales)
    else claves.push(`line-${line.id || index}`)
  }
  return claves
}
