import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { gs } from '@/utils/calculos'

// Campañas de recompra: segmento → selección → plantilla → enlaces wa.me.
// El envío lo hace una persona (no hay credenciales de WhatsApp), así que acá
// se registra la campaña y se generan los enlaces. Los clientes contactados
// quedan fuera de la próxima segmentación durante la ventana de enfriamiento.
const SEGMENTOS_FALLBACK = [
  { key: 'INACTIVE', nombre: 'Inactivos', descripcion: 'Última compra hace N días o más.' },
  { key: 'NO_PURCHASES', nombre: 'Nunca compraron', descripcion: 'Fichas sin pedidos.' },
  { key: 'FREQUENT', nombre: 'Recurrentes', descripcion: 'Al menos N compras.' },
  { key: 'CATEGORY', nombre: 'Compraron una categoría', descripcion: 'Compraron la categoría indicada.' },
]
const MOTIVOS = {
  sin_telefono: 'Sin teléfono',
  sin_opt_in: 'Sin consentimiento de WhatsApp',
  contactado_reciente: 'Contactado hace poco',
  fuera_segmento: 'Ya no cumple el segmento',
}
const fecha = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-PY')
}

export default function MarketingCampaigns({ open, onClose, onContacted }) {
  const toast = useToast()
  const [segmentos, setSegmentos] = useState(SEGMENTOS_FALLBACK)
  const [segmento, setSegmento] = useState('INACTIVE')
  const [dias, setDias] = useState('180')
  const [minCompras, setMinCompras] = useState('3')
  const [categoria, setCategoria] = useState('')
  const [cooldown, setCooldown] = useState('30')
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [templateKey, setTemplateKey] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [campanas, setCampanas] = useState([])

  const cargarPlantillas = useCallback(async () => {
    try {
      const rows = await api.get('/api/message-templates?category=CUSTOMERS')
      const activas = (Array.isArray(rows) ? rows : []).filter((item) => item.isActive !== false)
      setPlantillas(activas)
      setTemplateKey((actual) => actual || (activas.find((item) => item.isDefault) || activas[0])?.key || '')
    } catch { setPlantillas([]) }
  }, [])

  const cargarCampanas = useCallback(async () => {
    try {
      const payload = await api.get('/api/marketing/campaigns')
      setCampanas(Array.isArray(payload?.campaigns) ? payload.campaigns : [])
      if (Array.isArray(payload?.segmentos) && payload.segmentos.length) setSegmentos(payload.segmentos)
    } catch { setCampanas([]) }
  }, [])

  useEffect(() => {
    if (!open) return
    setResultado(null); setError('')
    cargarPlantillas(); cargarCampanas()
  }, [open, cargarPlantillas, cargarCampanas])

  async function segmentar(event) {
    event?.preventDefault()
    if (cargando) return
    setCargando(true); setError(''); setResultado(null)
    try {
      const params = new URLSearchParams({ segment: segmento, limit: '200' })
      if (segmento === 'INACTIVE') params.set('days', dias || '180')
      if (segmento === 'FREQUENT') params.set('minOrders', minCompras || '3')
      if (segmento === 'CATEGORY' && categoria.trim()) params.set('category', categoria.trim())
      params.set('cooldownDays', cooldown || '30')
      const payload = await api.get(`/api/customers/segments?${params}`)
      setData(payload)
      setSeleccion((payload?.rows || []).filter((row) => row.eligible).map((row) => row.id))
    } catch (cause) { setError(cause?.message || 'No se pudo segmentar los clientes.'); setData(null) } finally { setCargando(false) }
  }

  async function registrarCampana() {
    if (enviando) return
    if (!seleccion.length) { setError('Elegí al menos un cliente.'); return }
    if (!templateKey) { setError('Elegí la plantilla del mensaje.'); return }
    setEnviando(true); setError('')
    try {
      const payload = await api.post('/api/marketing/campaigns', {
        segment: segmento,
        days: segmento === 'INACTIVE' ? Number(dias || 180) : undefined,
        minOrders: segmento === 'FREQUENT' ? Number(minCompras || 3) : undefined,
        category: segmento === 'CATEGORY' ? categoria.trim() : undefined,
        cooldownDays: Number(cooldown || 30),
        templateKey,
        customerIds: seleccion,
      })
      setResultado(payload)
      toast.success(`Campaña registrada: ${payload?.recipients?.length || 0} mensaje(s) listos.`)
      await cargarCampanas()
      onContacted?.()
    } catch (cause) { setError(cause?.message || 'No se pudo registrar la campaña.') } finally { setEnviando(false) }
  }

  const rows = data?.rows || []
  const elegibles = rows.filter((row) => row.eligible)
  const alternar = (id) => setSeleccion((actuales) => actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id])
  const plantilla = plantillas.find((item) => item.key === templateKey)

  return (
    <Modal open={open} onClose={() => !enviando && onClose?.()} title="Campañas de recompra" className="max-w-4xl">
      <div className="space-y-4" data-testid="marketing-panel">
        <Card className="space-y-3">
          <form onSubmit={segmentar} className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1 text-xs text-mute"><span>Segmento</span>
              <Select aria-label="Segmento" value={segmento} onChange={(event) => { setSegmento(event.target.value); setData(null); setSeleccion([]) }} className="w-56">
                {segmentos.map((item) => <option key={item.key} value={item.key}>{item.nombre}</option>)}
              </Select>
            </label>
            {segmento === 'INACTIVE' && <label className="block w-28 space-y-1 text-xs text-mute"><span>Días sin comprar</span><Input aria-label="Días sin comprar" inputMode="numeric" maxLength={4} value={dias} onChange={(event) => setDias(event.target.value.replace(/\D/g, ''))} placeholder="180" /></label>}
            {segmento === 'FREQUENT' && <label className="block w-28 space-y-1 text-xs text-mute"><span>Mínimo de compras</span><Input aria-label="Mínimo de compras" inputMode="numeric" maxLength={4} value={minCompras} onChange={(event) => setMinCompras(event.target.value.replace(/\D/g, ''))} placeholder="3" /></label>}
            {segmento === 'CATEGORY' && <label className="block w-44 space-y-1 text-xs text-mute"><span>Categoría comprada</span><Input aria-label="Categoría comprada" maxLength={120} value={categoria} onChange={(event) => setCategoria(event.target.value)} placeholder="Celulares" /></label>}
            <label className="block w-32 space-y-1 text-xs text-mute"><span>No repetir (días)</span><Input aria-label="Días sin repetir contacto" inputMode="numeric" maxLength={4} value={cooldown} onChange={(event) => setCooldown(event.target.value.replace(/\D/g, ''))} placeholder="30" /></label>
            <Button type="submit" disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar clientes'}</Button>
          </form>
          <p className="text-xs text-mute">{segmentos.find((item) => item.key === segmento)?.descripcion} Los clientes sin consentimiento de WhatsApp o contactados dentro de la ventana de enfriamiento no se incluyen.</p>
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        </Card>

        {cargando && !data && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
        {data && rows.length === 0 && <EmptyState compact icon="users" title="Sin clientes en este segmento." description="Probá otro segmento o ampliá los días de inactividad." />}
        {data && rows.length > 0 && (
          <div className="space-y-2" data-testid="marketing-clientes">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
              <span>{rows.length} cliente(s) en el segmento · <b className="text-fore">{elegibles.length}</b> elegible(s) para WhatsApp</span>
              <span>{seleccion.length} seleccionado(s)</span>
            </div>
            {rows.map((row) => (
              <label key={row.id} data-testid="marketing-cliente" className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 p-2.5">
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar a ${row.name}`} checked={seleccion.includes(row.id)} disabled={!row.eligible || enviando} onChange={() => alternar(row.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><b className="truncate text-sm">{row.name}</b>
                    {row.pricingTier === 'WHOLESALE' && <Badge color="orange">Mayorista</Badge>}
                    {!row.eligible && <Badge color="slate">{MOTIVOS[row.reason] || 'No elegible'}</Badge>}
                    {row.marketingContactedAt && <Badge color="blue">Contactado {fecha(row.marketingContactedAt)}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-mute">{row.orderCount} compra(s) · última {row.lastOrderAt ? fecha(row.lastOrderAt) : 'sin compras'} · {row.phone || 'sin teléfono'} · {gs(row.totalSpentPyg)}{row.outstandingPyg > 0 ? ` · saldo ${gs(row.outstandingPyg)}` : ''}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {data && rows.length > 0 && (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-64 flex-1 space-y-1 text-xs text-mute"><span>Plantilla del mensaje</span>
                <Select aria-label="Plantilla del mensaje" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
                  {plantillas.length === 0 && <option value="">Sin plantillas de clientes</option>}
                  {plantillas.map((item) => <option key={item.id} value={item.key}>{item.name}{item.isDefault ? ' (predeterminada)' : ''}</option>)}
                </Select>
              </label>
              <Button type="button" disabled={enviando || !seleccion.length || !templateKey} onClick={registrarCampana}>{enviando ? 'Registrando…' : 'Registrar campaña y generar enlaces'}</Button>
            </div>
            {plantilla && <p className="whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-800/50 p-3 text-xs text-mute">{plantilla.body}</p>}
          </Card>
        )}

        {resultado && (
          <Card className="space-y-2">
            <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
              Campaña «{resultado.campaign?.name}» registrada: {resultado.recipients?.length || 0} mensaje(s) listos, {resultado.skipped?.length || 0} omitido(s). Los contactados no vuelven a aparecer en la ventana de enfriamiento.
            </p>
            {resultado.recipients?.map((row) => (
              <div key={row.customerId} data-testid="marketing-destinatario" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 p-2.5">
                <span className="min-w-0"><b className="text-sm">{row.name}</b><span className="mt-0.5 block truncate text-xs text-mute">{row.phone} · enlace wa.me listo</span></span>
                <span className="flex gap-2">
                  <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold" onClick={async () => { try { await navigator.clipboard.writeText(row.whatsappUrl); toast.success('Enlace copiado.') } catch { toast.error('No se pudo copiar el enlace.') } }}><Icon name="copy" className="mr-1 inline h-3 w-3" />Copiar enlace</button>
                  <a className="rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-black" href={row.whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
                </span>
              </div>
            ))}
            {resultado.skipped?.length > 0 && <p className="text-xs text-mute">Omitidos: {resultado.skipped.map((row) => `${row.name} (${MOTIVOS[row.reason] || row.reason})`).join(' · ')}</p>}
          </Card>
        )}

        {campanas.length > 0 && (
          <Card className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Campañas recientes</h3>
            <div className="space-y-1">
              {campanas.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs">
                  <span className="truncate"><b className="text-sm">{item.name}</b> · {fecha(item.createdAt)} · {item.createdBy?.name || 'Sistema'}</span>
                  <span className="text-mute">{item.recipientCount} enviado(s) · {item.skippedCount} omitido(s)</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Modal>
  )
}
