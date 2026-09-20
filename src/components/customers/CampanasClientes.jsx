import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import Icon from '@/components/shared/Icon'
import { Badge, Button, Select } from '@/components/ui'
import { renderPlantilla } from '@/lib/whatsappPlantillas'
import { whatsappUrl } from '@/components/customers/customerMessaging'

// Campañas de recompra (#82): segmentos calculados por el backend, selección
// de destinatarios, vista previa de la plantilla de WhatsApp (categoría
// CUSTOMERS) y envío de a uno con marca de contacto en la ficha.
const SEGMENTOS = [
  { clave: 'inactivos6m', nombre: 'Inactivos 6 meses', descripcion: 'Última compra hace más de 6 meses o sin pedidos.' },
  { clave: 'mayoristasDormidos', nombre: 'Mayoristas dormidos', descripcion: 'Mayoristas sin compra en los últimos 3 meses.' },
  { clave: 'deudoresAlDia', nombre: 'Deudores al día', descripcion: 'Con saldo pendiente y sin vencimientos.' },
]

const primerNombre = (nombre) => String(nombre || 'cliente').trim().split(/\s+/)[0] || 'cliente'
const fecha = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY') : '')

// Motivo por el que una ficha no se puede contactar ('' = elegible).
function motivoNoElegible(row) {
  if (!String(row.phone || '').trim()) return 'Sin teléfono'
  if (!row.acceptsWhatsappMarketing) return 'Sin consentimiento'
  if (row.marketingContactedAt) return `Contactado ${fecha(row.marketingContactedAt)}`
  return ''
}

export default function CampanasClientes({ templates = [], empresa, sucursal, vendedor }) {
  const [segmento, setSegmento] = useState(SEGMENTOS[0].clave)
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [plantillaId, setPlantillaId] = useState('')
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError(''); setAviso(''); setSeleccion(new Set())
    try {
      setData(await api.get(`/api/customers/segments?segment=${segmento}`))
    } catch (cause) {
      setData(null)
      setError(cause?.status === 403 ? 'Solo administración y gerencia pueden usar campañas.' : 'No se pudieron cargar los segmentos. Intentá de nuevo.')
    } finally { setCargando(false) }
  }, [segmento])

  useEffect(() => { cargar() }, [cargar])

  const plantillas = useMemo(() => templates.filter((item) => !item.category || item.category === 'CUSTOMERS'), [templates])
  const plantilla = plantillas.find((item) => item.id === plantillaId) || plantillas[0] || null
  const clientes = data?.customers || []
  const elegibles = clientes.filter((row) => !motivoNoElegible(row))
  const seleccionados = clientes.filter((row) => seleccion.has(row.id) && !motivoNoElegible(row))
  const proximo = (seleccionados.length ? seleccionados : elegibles)[0] || null

  const valores = useCallback((row) => ({
    cliente: row?.name || 'cliente',
    nombre: primerNombre(row?.name),
    customer_name: row?.name || 'cliente',
    empresa: empresa?.nombre || 'la tienda',
    sucursal: sucursal?.nombre || 'la tienda',
    branch_name: sucursal?.nombre || 'la tienda',
    vendedor: vendedor || '',
    saldo_pendiente: row?.pendingPyg ? `Gs ${Number(row.pendingPyg).toLocaleString('es-PY')}` : '',
    ultima_compra: fecha(row?.lastOrderAt),
  }), [empresa, sucursal, vendedor])

  const previewRow = seleccionados[0] || elegibles[0] || clientes[0] || null
  const preview = plantilla ? renderPlantilla(plantilla.body, valores(previewRow)).trim() : ''

  function alternar(id) {
    setSeleccion((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  async function marcarContactado(row) {
    setData((actual) => actual ? { ...actual, customers: actual.customers.map((item) => item.id === row.id ? { ...item, marketingContactedAt: new Date().toISOString() } : item) } : actual)
    setSeleccion((actual) => { const siguiente = new Set(actual); siguiente.delete(row.id); return siguiente })
    try {
      await api.post('/api/customers/segments', { customerIds: [row.id], segment: segmento })
    } catch {
      setAviso(`Se abrió WhatsApp con ${row.name}, pero no se pudo guardar la marca de contacto.`)
    }
  }

  async function enviar(row) {
    if (!plantilla) { setAviso('Elegí una plantilla de WhatsApp.'); return }
    const enlace = whatsappUrl(row.phone, renderPlantilla(plantilla.body, valores(row)).trim(), row.countryCode)
    if (!enlace) { setAviso(`El teléfono de ${row.name} no es válido para WhatsApp.`); return }
    setAviso('')
    window.open(enlace, '_blank', 'noopener,noreferrer')
    await marcarContactado(row)
  }

  return <section className="space-y-4 rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <Icon name="megaphone" className="mt-0.5 h-5 w-5 text-fono-light" />
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-mute">Campañas de recompra</h2>
          <p className="mt-1 text-sm text-mute">Elegí un segmento, revisá el mensaje y abrí WhatsApp de a uno. Cada envío queda marcado en la ficha para no repetir.</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={cargar} disabled={cargando}><Icon name="refresh" className="h-4 w-4" />Actualizar</Button>
    </div>

    <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
      {SEGMENTOS.map((item) => <button key={item.clave} type="button" aria-pressed={segmento === item.clave} title={item.descripcion} onClick={() => setSegmento(item.clave)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${segmento === item.clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{item.nombre}</button>)}
    </div>

    {cargando && <div role="status" aria-busy="true" className="space-y-2 py-2"><span className="block h-12 animate-pulse rounded-xl bg-ink-700" /><span className="block h-12 animate-pulse rounded-xl bg-ink-700" /></div>}
    {!cargando && error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"><p>{error}</p>{!error.includes('Solo administración') && <Button variant="outline" onClick={cargar}>Reintentar</Button>}</div>}

    {!cargando && !error && data && <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color="blue">{data.total} en el segmento</Badge>
        <Badge color="green">{elegibles.length} elegibles</Badge>
        <Badge color="slate">{data.total - elegibles.length} con contacto previo, sin teléfono o sin consentimiento</Badge>
        {data.total > clientes.length && <span className="text-xs text-mute">Se listan los primeros {clientes.length}.</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-mute">Plantilla (Clientes)</span>
          <Select aria-label="Plantilla de la campaña" value={plantilla?.id || ''} onChange={(event) => setPlantillaId(event.target.value)} disabled={!plantillas.length}>
            {!plantillas.length && <option value="">Sin plantillas de clientes</option>}
            {plantillas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </label>
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-mute">Vista previa{previewRow ? ` · ${previewRow.name}` : ''}</span>
          <p aria-label="Vista previa del mensaje" className="min-h-[4.5rem] whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-900/40 p-3 text-sm">{preview || 'Elegí una plantilla para ver el mensaje.'}</p>
        </div>
      </div>

      {!clientes.length && <p role="status" className="rounded-xl border border-ink-600 p-6 text-center text-sm text-mute">No hay clientes en este segmento.</p>}

      {clientes.length > 0 && <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {clientes.map((row) => {
          const motivo = motivoNoElegible(row)
          return <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 p-2.5">
            <input type="checkbox" aria-label={`Seleccionar a ${row.name}`} className="h-4 w-4" checked={seleccion.has(row.id)} disabled={Boolean(motivo)} onChange={() => alternar(row.id)} />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{row.name}</b>
              <p className="mt-0.5 truncate text-xs text-mute">{row.phone ? `${row.countryCode || ''} ${row.phone}` : 'Sin teléfono'} · Última compra: {fecha(row.lastOrderAt) || 'sin pedidos'} · Total: Gs {Number(row.totalSpentPyg || 0).toLocaleString('es-PY')}{row.pendingPyg ? ` · Saldo: Gs ${Number(row.pendingPyg).toLocaleString('es-PY')}` : ''}</p>
            </div>
            {motivo && <Badge color={row.marketingContactedAt ? 'slate' : 'orange'}>{motivo}</Badge>}
            <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" disabled={Boolean(motivo) || !plantilla} onClick={() => enviar(row)} title={motivo || `Abrir WhatsApp con ${row.name}`}><Icon name="send" className="h-3.5 w-3.5" />WhatsApp</Button>
          </li>
        })}
      </ul>}

      {elegibles.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-3">
        <Button type="button" disabled={!plantilla || !proximo} onClick={() => proximo && enviar(proximo)}><Icon name="send" className="h-4 w-4" />Abrir el próximo ({proximo ? proximo.name : 'sin pendientes'})</Button>
        <span className="text-xs text-mute">{seleccionados.length ? `${seleccionados.length} seleccionados` : 'Se recorre todo el segmento si no seleccionás a nadie'} · quedan {elegibles.length} por contactar</span>
      </div>}

      {aviso && <p role="alert" className="text-sm text-warn">{aviso}</p>}
    </>}
  </section>
}
