import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, ConfirmDialog, Input, Modal, Money, Select, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { fechaHoraCorta } from '@/utils/fecha'
import { codigoPedido } from '@/utils/pedido'
import { useSellerData, SellerFeedback } from '@/components/ventas/SellerData'
import { deliveryFields, settlementFields, ENTREGA_LABELS, MEDIO_LABELS, RENDICION_LABELS, SIN_DATOS } from './datos'

// Vista de la tienda para el reparto propio: asignar pedidos a un repartidor
// (con la entrega con saldo autorizada desde acá) y verificar las rendiciones
// del efectivo/transferencia que el repartidor trae de vuelta.

const TONO_RENDICION = (estado) => estado === 'VERIFIED' ? 'green' : estado === 'REJECTED' ? 'red' : 'orange'

function Tabs({ value, onChange, items }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
      {items.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', value === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>
      ))}
    </div>
  )
}

function Asignaciones() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const [asignado, setAsignado] = useState('sin-asignar')
  const data = useSellerData(`/api/delivery/orders?estado=activos&asignado=${asignado}`, deliveryFields, SIN_DATOS, esDemo, { limit: 50 })
  const [equipo, setEquipo] = useState([])
  const [seleccion, setSeleccion] = useState({})
  const [autorizar, setAutorizar] = useState({})
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (esDemo) { setEquipo([]); return }
    api.get('/api/delivery/team').then(rows => setEquipo(Array.isArray(rows) ? rows : [])).catch(() => setEquipo([]))
  }, [esDemo])

  async function asignar(row) {
    const repartidorId = seleccion[row.id] || row.repartidorId || ''
    if (!repartidorId || ocupado) return
    setOcupado(row.id); setError('')
    try {
      await api.post(`/api/orders/${encodeURIComponent(row.id)}/assignment`, {
        assignedToId: repartidorId,
        ...(autorizar[row.id] ? { allowUnpaidDelivery: true } : {}),
      })
      toast.success('Reparto asignado', `${codigoPedido(row.number)} quedó a cargo del repartidor.`)
      data.refresh()
    } catch (cause) {
      toast.error('No se pudo asignar', cause?.message || 'Intentá de nuevo.')
    } finally { setOcupado('') }
  }

  async function liberar(row) {
    if (ocupado) return
    setOcupado(row.id)
    try {
      await api.post(`/api/orders/${encodeURIComponent(row.id)}/assignment`, { assignedToId: null })
      toast.success('Reparto liberado', `${codigoPedido(row.number)} volvió a la tienda.`)
      data.refresh()
    } catch (cause) {
      toast.error('No se pudo liberar', cause?.message || 'Intentá de nuevo.')
    } finally { setOcupado('') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={asignado} onChange={setAsignado} items={[['sin-asignar', 'Sin asignar'], ['asignados', 'Asignados'], ['todos', 'Todos']]} />
        <button type="button" onClick={data.refresh} disabled={data.loading} className="ml-auto rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      </div>
      {!esDemo && equipo.length === 0 && (
        <p className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-sm text-warn">
          Todavía no hay repartidores. Creá un integrante con el rol Repartidor en Configuración → Equipo.
        </p>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
      <SellerFeedback {...data} empty={!data.rows.length} />
      <div className="space-y-3">
        {data.rows.map(row => (
          <article key={row.id} data-testid="reparto-admin-pedido" data-pedido={row.number} className="rounded-2xl border border-fore/10 bg-ink-800/40 p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-fono-light">{codigoPedido(row.number)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {row.repartidor && <Badge color="blue">{row.repartidor}</Badge>}
                {row.sinRendir > 0 && row.pendiente === 0 && <Badge color="orange">Pre-pagado sin verificar</Badge>}
                <Badge color={row.fulfillment === 'DELIVERED' ? 'green' : 'slate'}>{ENTREGA_LABELS[row.fulfillment] || row.fulfillment}</Badge>
              </div>
            </header>
            <p className="mt-2 text-sm font-semibold">{row.cliente}</p>
            <p className="text-xs text-mute">{row.articulos.join(' · ') || 'Sin artículos'}</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-mute">
              <span>Total <strong className="text-fore"><Money value={row.total} /></strong></span>
              <span>Falta cobrar <strong className={row.pendiente ? 'text-bad' : 'text-ok'}><Money value={row.pendiente} /></strong></span>
              {row.sinRendir > 0 && <span>Cobrado en la calle sin rendir <strong className="text-warn"><Money value={row.sinRendir} /></strong></span>}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {row.repartidorId ? (
                <>
                  <Select aria-label={`Repartidor de ${codigoPedido(row.number)}`} className="w-full max-w-[220px]" value={row.repartidorId} onChange={event => setSeleccion(actual => ({ ...actual, [row.id]: event.target.value }))}>
                    <option value={row.repartidorId}>{row.repartidor}</option>
                    {equipo.filter(persona => persona.id !== row.repartidorId).map(persona => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
                  </Select>
                  <Button type="button" variant="outline" disabled={ocupado === row.id} onClick={() => asignar(row)}>Reasignar</Button>
                  <Button type="button" variant="ghost" disabled={ocupado === row.id} onClick={() => liberar(row)}>Liberar</Button>
                </>
              ) : (
                <>
                  <Select aria-label={`Repartidor de ${codigoPedido(row.number)}`} className="w-full max-w-[220px]" value={seleccion[row.id] || ''} onChange={event => setSeleccion(actual => ({ ...actual, [row.id]: event.target.value }))}>
                    <option value="">Elegí el repartidor</option>
                    {equipo.map(persona => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
                  </Select>
                  <Button type="button" disabled={!seleccion[row.id] || ocupado === row.id} onClick={() => asignar(row)} data-testid="asignar-reparto">Asignar</Button>
                </>
              )}
              {row.pendiente > 0 && row.fulfillment !== 'DELIVERED' && (
                <label className="flex items-center gap-2 text-xs text-mute">
                  <Input type="checkbox" className="h-4 w-4" checked={Boolean(autorizar[row.id])} onChange={event => setAutorizar(actual => ({ ...actual, [row.id]: event.target.checked }))} />
                  Autorizar entrega con saldo
                </label>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Rendiciones() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const [estado, setEstado] = useState('PENDING')
  const data = useSellerData(`/api/delivery/settlements?estado=${estado}`, settlementFields, SIN_DATOS, esDemo, { limit: 60 })
  const [confirmar, setConfirmar] = useState(null)
  const [rechazar, setRechazar] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function verificar(fila, state, note = '') {
    if (ocupado) return
    setOcupado(true)
    try {
      await api.post(`/api/delivery/settlements/${encodeURIComponent(fila.id)}/verify`, { state, ...(note.trim() ? { note: note.trim() } : {}) })
      toast.success(state === 'VERIFIED' ? 'Rendición verificada' : 'Rendición rechazada', state === 'VERIFIED' ? 'Los cobros quedaron confirmados en el pedido y en caja.' : 'El repartidor puede volver a registrarlos.')
      setConfirmar(null); setRechazar(null); setMotivo('')
      data.refresh()
    } catch (cause) {
      toast.error('No se pudo verificar', cause?.message || 'Intentá de nuevo.')
    } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={estado} onChange={setEstado} items={[['PENDING', 'Pendientes'], ['VERIFIED', 'Verificadas'], ['REJECTED', 'Rechazadas'], ['', 'Todas']]} />
        <button type="button" onClick={data.refresh} disabled={data.loading} className="ml-auto rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      </div>
      <SellerFeedback {...data} empty={!data.rows.length} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.rows.map(fila => (
          <article key={fila.id} data-testid="rendicion-admin" data-rendicion={fila.id} className="rounded-2xl border border-fore/10 bg-ink-800/40 p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{fila.repartidor}</span>
              <Badge color={TONO_RENDICION(fila.estado)}>{RENDICION_LABELS[fila.estado] || fila.estado}</Badge>
            </header>
            <p className="mt-1 text-xs text-mute">{fechaHoraCorta(fila.fecha)}{fila.sucursal ? ` · ${fila.sucursal}` : ''}</p>
            <div className="mt-2 space-y-1">
              <p className="flex items-baseline justify-between gap-3"><span className="text-xs text-mute">Rendido</span><span className="text-base font-bold tabular-nums"><Money value={fila.total} /></span></p>
              <p className="flex items-baseline justify-between gap-3"><span className="text-xs text-mute">Saldo que queda</span><span className="text-sm tabular-nums"><Money value={fila.pendiente} /></span></p>
              <p className="text-xs text-mute">{fila.pedidos} {fila.pedidos === 1 ? 'pedido' : 'pedidos'} · {fila.cobros.length} {fila.cobros.length === 1 ? 'cobro' : 'cobros'}</p>
              {fila.nota && <p className="text-xs text-mute">Observación: {fila.nota}</p>}
            </div>
            <ul className="mt-3 space-y-1 border-t border-fore/10 pt-2">
              {fila.cobros.map(cobro => (
                <li key={cobro.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-mono text-mute">{codigoPedido(cobro.pedidoNumero || '—')}</span>
                  <span className="text-mute">{MEDIO_LABELS[cobro.metodo] || cobro.metodo}{cobro.referencia ? ` · ${cobro.referencia}` : ''}</span>
                  <span className="font-semibold tabular-nums"><Money value={cobro.monto} /></span>
                </li>
              ))}
            </ul>
            {fila.estado === 'PENDING' && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" disabled={ocupado} onClick={() => setConfirmar(fila)} data-testid="rendicion-verificar"><Icon name="check" className="h-4 w-4" />Verificar</Button>
                <Button type="button" variant="outline" disabled={ocupado} onClick={() => { setMotivo(''); setRechazar(fila) }}>Rechazar</Button>
              </div>
            )}
            {fila.verificadaPor && <p className="mt-2 text-xs text-mute">Verificada por {fila.verificadaPor}{fila.notaVerificacion ? ` · ${fila.notaVerificacion}` : ''}</p>}
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirmar)}
        onCancel={() => setConfirmar(null)}
        onConfirm={() => verificar(confirmar, 'VERIFIED')}
        title="¿Verificar la rendición?"
        description={confirmar ? `Se confirman ${confirmar.cobros.length} cobros por ${confirmar.total.toLocaleString('es-PY')} Gs. Entran a caja/finanzas y el pedido cierra si quedó saldado.` : ''}
        confirmLabel="Verificar"
        busy={ocupado}
      />

      <Modal open={Boolean(rechazar)} onClose={() => !ocupado && setRechazar(null)} title="Rechazar la rendición" className="max-w-md">
        <p className="text-sm text-mute">Los cobros quedan sin efecto y el repartidor puede volver a registrarlos.</p>
        <label htmlFor="rendicion-motivo" className="mt-4 block text-sm font-semibold">Motivo</label>
        <Textarea id="rendicion-motivo" className="mt-2" rows={3} maxLength={500} value={motivo} onChange={event => setMotivo(event.target.value)} placeholder="Ej.: el efectivo entregado no coincide con lo rendido" />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={ocupado} onClick={() => setRechazar(null)}>Cancelar</Button>
          <Button type="button" disabled={ocupado || motivo.trim().length < 3} onClick={() => verificar(rechazar, 'REJECTED', motivo)} data-testid="rendicion-rechazar">Rechazar</Button>
        </div>
      </Modal>
    </div>
  )
}

export default function StoreDelivery() {
  const [tab, setTab] = useState('repartos')
  return (
    <section className="space-y-5">
      <p className="text-sm text-mute">Asigná cada pedido a un repartidor y verificá lo que rinde al volver: el cobro de la calle recién queda confirmado acá.</p>
      <Tabs value={tab} onChange={setTab} items={[['repartos', 'Repartos'], ['rendiciones', 'Rendiciones']]} />
      {tab === 'repartos' ? <Asignaciones /> : <Rendiciones />}
    </section>
  )
}
