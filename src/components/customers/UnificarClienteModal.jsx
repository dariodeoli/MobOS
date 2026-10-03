import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, Modal, Skeleton, useResultado } from '@/components/ui'
import SearchField from '@/components/shared/SearchField'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import { internationalPhone } from '@/utils/telefono'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

// Unificar clientes duplicados (#268): buscar el duplicado, ver el preview de lo
// que se mueve y elegir la ficha principal. El duplicado queda archivado con
// puntero; la UI muestra el resumen de ambos lados antes de confirmar.

const FILAS_MOVIMIENTO = [
  ['orders', 'Pedidos'],
  ['payments', 'Pagos'],
  ['quotes', 'Cotizaciones'],
  ['notes', 'Notas'],
  ['followUps', 'Seguimientos'],
  ['notices', 'Mensajes'],
  ['addresses', 'Direcciones'],
  ['billingIdentities', 'Titulares'],
  ['portalTokens', 'Enlaces del portal'],
  ['warranties', 'Garantías'],
  ['serviceOrders', 'Órdenes de taller'],
  ['storeCredits', 'Saldos a favor'],
  ['loyaltyMovements', 'Movimientos de puntos'],
  ['reservations', 'Reservas'],
  ['authorizations', 'Autorizaciones'],
  ['marketingRecipients', 'Envíos de campaña'],
  ['suspendedSales', 'Ventas suspendidas'],
  ['supplyNeeds', 'Necesidades de compra'],
]

function Contacto({ perfil }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold">{perfil?.name || 'Sin nombre'}</p>
      <p className="mt-0.5 truncate text-xs text-mute">
        {[perfil?.document ? `CI/RUC ${perfil.document}` : '', perfil?.phone ? `+${internationalPhone(perfil.phone, perfil.countryCode)}` : '', perfil?.email || ''].filter(Boolean).join(' · ') || 'Sin contacto'}
      </p>
      {(perfil?.tags || []).length > 0 && <p className="mt-1 flex flex-wrap gap-1">{(perfil.tags || []).map((tag) => <Badge key={tag} color="slate" className="px-1.5 py-0 text-[10px]">{tag}</Badge>)}</p>}
    </div>
  )
}

function Lado({ clave, datos, principal, onPrincipal, titulo }) {
  const conteos = datos?.conteos || {}
  const filas = FILAS_MOVIMIENTO.filter(([campo]) => Number(conteos[campo] || 0) > 0)
  return (
    <div className={cn('rounded-xl border p-3', principal === clave ? 'border-fono/50 bg-fono/5' : 'border-ink-600 bg-ink-800/60')} data-testid={`merge-lado-${clave}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Avatar user={{ id: datos?.perfil?.id, name: datos?.perfil?.name }} size="lg" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mute">{titulo}{principal === clave ? ' · principal' : ' · se archiva'}</p>
            <Contacto perfil={datos?.perfil} />
          </div>
        </div>
        <Button type="button" variant={principal === clave ? undefined : 'outline'} className="h-8 shrink-0 px-2 text-xs" onClick={() => onPrincipal(clave)}>
          {principal === clave ? 'Queda como principal' : 'Elegir como principal'}
        </Button>
      </div>
      <div className="mt-3 space-y-1">
        {filas.length === 0 && <p className="text-xs text-mute">Sin historial para mover.</p>}
        {filas.map(([campo, etiqueta]) => (
          <p key={campo} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-mute">{etiqueta}</span>
            <span className="font-semibold tabular-nums text-fore">{conteos[campo]}</span>
          </p>
        ))}
      </div>
      {principal === clave && (datos?.rellenados || []).length > 0 && (
        <p className="mt-3 rounded-lg border border-ink-600 bg-ink-900/60 px-2 py-1.5 text-[11px] text-mute">
          Se completa con la otra ficha: {datos.rellenados.join(', ')}.
        </p>
      )}
    </div>
  )
}

export default function UnificarClienteModal({ open, cliente, duplicado, onClose, onMerged }) {
  const avisar = useResultado()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [elegido, setElegido] = useState(null)
  const [preview, setPreview] = useState(null)
  const [principal, setPrincipal] = useState('a')
  const [tocado, setTocado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setQuery(''); setResultados([]); setElegido(null); setPreview(null); return }
    setQuery(duplicado?.name || ''); setResultados([]); setElegido(duplicado || null); setPreview(null); setPrincipal('a'); setTocado(false); setError('')
  }, [open, duplicado])

  useEffect(() => {
    if (!open || !query.trim()) { setResultados([]); return undefined }
    const timer = setTimeout(async () => {
      try {
        const rows = await api.get(`/api/customers?q=${encodeURIComponent(query.trim())}`)
        setResultados((Array.isArray(rows) ? rows : []).filter((fila) => fila.id !== cliente?.id).slice(0, 6))
      } catch { setResultados([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [open, query, cliente?.id])

  useEffect(() => {
    if (!open || !elegido || !cliente?.id) { setPreview(null); return undefined }
    let activo = true
    setPreview(null)
    api.get(`/api/customers/${encodeURIComponent(cliente.id)}/merge?with=${encodeURIComponent(elegido.id)}`)
      .then((data) => { if (activo) setPreview(data) })
      .catch((cause) => { if (activo) setError(cause?.message || 'No se pudo preparar la unificación.') })
    return () => { activo = false }
  }, [open, elegido, cliente?.id])

  async function confirmar() {
    if (busy || !elegido || !cliente?.id) return
    setBusy(true); setError('')
    try {
      const principalId = principal === 'a' ? cliente.id : elegido.id
      const duplicateId = principal === 'a' ? elegido.id : cliente.id
      await api.post(`/api/customers/${encodeURIComponent(cliente.id)}/merge`, { principalId, duplicateId })
      avisar.guardado('La unificación', 'La ficha duplicada quedó archivada con puntero a la principal.')
      onMerged?.()
    } catch (cause) {
      avisar.fallo('guardar', cause?.message || 'No se pudieron unificar los clientes.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} dirty={tocado} title="Unificar cliente duplicado" size="amplio">
      <div className="space-y-4" data-testid="unificar-cliente">
        <p className="text-sm text-mute">
          Buscá la otra ficha de la misma persona (nombre, teléfono, CI/RUC o correo). Vas a ver qué se mueve antes de confirmar: el duplicado no se borra, queda archivado con un puntero.
        </p>
        <div className="flex items-center gap-2">
          <Avatar user={{ id: cliente?.id, name: cliente?.name }} size="lg" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Esta ficha</p>
            <p className="truncate font-semibold">{cliente?.name || 'Sin nombre'}</p>
          </div>
        </div>
        <SearchField ariaLabel="Buscar el cliente duplicado" placeholder="Nombre, teléfono, CI/RUC o correo del duplicado" value={query} onChange={(event) => { setQuery(event.target.value); setElegido(null) }} />
        {!elegido && resultados.length > 0 && (
          <div className="space-y-1" data-testid="unificar-resultados">
            {resultados.map((fila) => (
              <button key={fila.id} type="button" onClick={() => { setElegido(fila); setTocado(true) }} className="flex w-full items-center gap-3 rounded-xl border border-ink-600 p-3 text-left text-sm transition hover:border-fono">
                <Avatar user={{ id: fila.id, name: fila.name }} size="lg" />
                <Contacto perfil={fila} />
                <Icon name="chevron" className="ml-auto h-4 w-4 shrink-0 text-mute" />
              </button>
            ))}
          </div>
        )}
        {!elegido && query.trim() && resultados.length === 0 && <p className="text-xs text-mute">Sin resultados para «{query.trim()}».</p>}
        {elegido && preview && (
          <>
            <div className={GRILLA_DOS_COLUMNAS}>
              <Lado clave="a" datos={preview.a} principal={principal} onPrincipal={(clave) => { setPrincipal(clave); setTocado(true) }} titulo="Esta ficha" />
              <Lado clave="b" datos={{ ...preview.b, perfil: { ...preview.b?.perfil, name: elegido.name } }} principal={principal} onPrincipal={(clave) => { setPrincipal(clave); setTocado(true) }} titulo="Ficha duplicada" />
            </div>
            {preview.conflictos?.length > 0 && (
              <Aviso tono="warn" className="rounded-xl p-3 text-xs">
                Datos que no coinciden (los del principal mandan): {preview.conflictos.map((conflicto) => `${conflicto.campo} (${conflicto.duplicado} → se conserva ${conflicto.principal})`).join(' · ')}
              </Aviso>
            )}
            <Aviso tono="info" className="rounded-xl p-3 text-xs">
              Se archiva <b>{(principal === 'a' ? elegido?.name : cliente?.name) || 'la ficha duplicada'}</b> y su historial pasa a <b>{(principal === 'a' ? cliente?.name : elegido?.name) || 'la ficha principal'}</b>. Los enlaces y tokens siguen funcionando.
            </Aviso>
            <div className={PIE_ACCIONES}>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setElegido(null); setPreview(null) }}>Elegir otro</Button>
              <Button type="button" disabled={busy || !preview} onClick={confirmar}>{busy ? 'Unificando…' : 'Unificar clientes'}</Button>
            </div>
          </>
        )}
        {!elegido && <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></div>}
        {elegido && !preview && !error && <Skeleton className="h-32 rounded-xl" />}
        {error && <Aviso tono="error" className="rounded-xl p-3 text-sm">{error}</Aviso>}
      </div>
    </Modal>
  )
}
