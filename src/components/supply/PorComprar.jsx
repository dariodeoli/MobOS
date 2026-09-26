import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Skeleton, useToast } from '@/components/ui'
import ProductCombobox from '@/components/shared/ProductCombobox'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Abastecimiento · F1 (#250/#254): panel móvil «Por comprar».
// Lee la API de necesidades (`/api/supply/needs`) que ya consolida por producto
// + condición conservando los destinos (pedido/reserva/stock), y permite
// asignar comprador y cancelar (auditado) o cargar una necesidad manual.
// El stock no se toca acá: eso pasa recién en la recepción (fases siguientes).

const PRIORIDAD = { URGENTE: 'Urgente', ALTA: 'Alta', NORMAL: 'Normal', BAJA: 'Baja' }
const TONO_PRIORIDAD = { URGENTE: 'red', ALTA: 'orange', NORMAL: 'blue', BAJA: 'slate' }
const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const ORIGEN = {
  SALE_NO_STOCK: 'Venta sin stock',
  RESERVATION_NO_STOCK: 'Reserva sin unidad',
  QUANTITY_OVER_STOCK: 'Venta sobre stock',
  BELOW_REORDER: 'Bajo reposición',
  ORDER_COMMITTED: 'Pedido comprometido',
  MANUAL: 'Manual',
}
const DESTINO = { PEDIDO: 'Pedido', RESERVA: 'Reserva', STOCK: 'Stock' }

const fechaCorta = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })
}

// Plazo de la fecha prometida: prioriza lo que vence antes (o ya venció).
function plazo(prometidaEl) {
  if (!prometidaEl) return null
  const fecha = new Date(prometidaEl)
  if (Number.isNaN(fecha.getTime())) return null
  const dias = Math.ceil((fecha.getTime() - Date.now()) / 86_400_000)
  if (dias < 0) return { texto: `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`, tono: 'font-semibold text-bad' }
  if (dias === 0) return { texto: 'vence hoy', tono: 'font-semibold text-warn' }
  if (dias <= 3) return { texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'text-warn' }
  return { texto: `para el ${fechaCorta(prometidaEl)}`, tono: 'text-mute' }
}

export default function PorComprar() {
  const toast = useToast()
  const esDemo = isDemoRuntime
  const [filas, setFilas] = useState([])
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('pendientes') // pendientes | compradas
  const [prioridad, setPrioridad] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [compradores, setCompradores] = useState([])
  const [asignar, setAsignar] = useState(null)
  const [comprador, setComprador] = useState('')
  const [cancelar, setCancelar] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [agregar, setAgregar] = useState(false)
  const [nuevo, setNuevo] = useState({ productId: '', quantity: '1', priority: 'NORMAL', promisedAt: '', notes: '' })
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (esDemo) return
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyNeeds.list(vista === 'compradas' ? { status: 'COMPRADA' } : {})
      setFilas(datos?.grupos || [])
      setTotales(datos?.totales || null)
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las necesidades.')
    } finally {
      setCargando(false)
    }
  }, [esDemo, vista])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    if (esDemo) return
    resources.users.list().then((filasUsuarios) => setCompradores((filasUsuarios || []).filter((u) => u.status !== 'INACTIVE'))).catch(() => setCompradores([]))
  }, [esDemo])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return filas.filter((fila) => {
      if (prioridad !== 'todas' && fila.prioridad !== prioridad) return false
      if (!q) return true
      return `${fila.producto || ''} ${fila.condicion || ''}`.toLowerCase().includes(q)
    })
  }, [filas, prioridad, busqueda])

  const urgencias = useMemo(() => filas.filter((fila) => fila.prioridad === 'URGENTE' || fila.prometidaEl).length, [filas])

  async function confirmarAsignacion() {
    if (!asignar || !comprador || busy) return
    setBusy(true)
    try {
      await Promise.all((asignar.necesidades || []).map((id) => resources.supplyNeeds.update({ id, action: 'assign', assignedToId: comprador })))
      const nombre = compradores.find((u) => u.id === comprador)?.name || 'el comprador'
      toast.success('Compra asignada', `${asignar.producto} quedó a nombre de ${nombre}.`)
      setAsignar(null)
      setComprador('')
      cargar()
    } catch (causa) {
      toast.error('No se pudo asignar', causa?.message || 'Reintentá en un momento.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarCancelacion() {
    if (!cancelar || motivo.trim().length < 4 || busy) return
    setBusy(true)
    try {
      await Promise.all((cancelar.necesidades || []).map((id) => resources.supplyNeeds.update({ id, action: 'cancel', reason: motivo.trim() })))
      toast.success('Necesidad cancelada', `${cancelar.producto} salió de la lista por comprar.`)
      setCancelar(null)
      setMotivo('')
      cargar()
    } catch (causa) {
      toast.error('No se pudo cancelar', causa?.message || 'Reintentá en un momento.')
    } finally {
      setBusy(false)
    }
  }

  async function guardarManual(evento) {
    evento.preventDefault()
    if (!nuevo.productId || busy) return
    setBusy(true)
    try {
      await resources.supplyNeeds.create({
        productId: nuevo.productId,
        quantity: Number(nuevo.quantity) || 1,
        priority: nuevo.priority,
        ...(nuevo.promisedAt ? { promisedAt: new Date(`${nuevo.promisedAt}T12:00:00`).toISOString() } : {}),
        ...(nuevo.notes.trim() ? { notes: nuevo.notes.trim() } : {}),
      })
      toast.success('Necesidad agregada', 'Entra a la lista por comprar con la prioridad elegida.')
      setAgregar(false)
      setNuevo({ productId: '', quantity: '1', priority: 'NORMAL', promisedAt: '', notes: '' })
      cargar()
    } catch (causa) {
      toast.error('No se pudo agregar', causa?.message || 'Revisá el producto y la cantidad.')
    } finally {
      setBusy(false)
    }
  }

  if (esDemo) {
    return (
      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Por comprar</h2>
        <p className="mt-1 text-sm text-mute">El centro de abastecimiento trabaja con las ventas, reservas y stock de una cuenta real.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4" data-testid="por-comprar">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Por comprar</h2>
            <p className="mt-1 text-sm text-mute">
              Lo que falta comprar, consolidado por producto y condición (conserva pedidos, reservas y reposición).
              El stock se suma recién al recibir la compra.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
              <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
            </Button>
            <Button type="button" onClick={() => setAgregar(true)}>+ Agregar necesidad</Button>
          </div>
        </div>
        {totales && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="blue">{totales.grupos} grupo{totales.grupos === 1 ? '' : 's'}</Badge>
            <Badge color="slate">{totales.unidades} unidad{totales.unidades === 1 ? '' : 'es'}</Badge>
            <Badge color="orange">{urgencias} con prioridad o fecha</Badge>
            <span>Actualizado {new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['pendientes', 'Por comprar'], ['compradas', 'Compradas']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={vista === id}
              onClick={() => setVista(id)}
              className={cn('min-h-9 rounded-lg px-3 text-xs font-semibold transition', vista === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
            >
              {label}
            </button>
          ))}
        </div>
        <Select aria-label="Prioridad" className="w-auto" value={prioridad} onChange={(evento) => setPrioridad(evento.target.value)}>
          <option value="todas">Todas las prioridades</option>
          {Object.entries(PRIORIDAD).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
        <Input
          aria-label="Buscar producto"
          placeholder="Buscar producto…"
          className="min-w-0 flex-1 sm:max-w-xs"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      </div>

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !filas.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !visibles.length ? (
        <EmptyState
          icon="box"
          title={filas.length ? 'Sin resultados con ese filtro.' : vista === 'compradas' ? 'No hay compras registradas.' : 'No hay nada por comprar.'}
          description={filas.length ? 'Probá con otra prioridad o palabra.' : 'Cuando una venta o reserva necesite stock, la necesidad aparece acá.'}
        />
      ) : (
        <div className="space-y-2.5">
          {visibles.map((grupo, indice) => {
            const vence = plazo(grupo.prometidaEl)
            return (
              <Card key={`${grupo.productoId}-${grupo.condicion}-${indice}`} className="p-3.5" data-testid="por-comprar-fila">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={grupo.producto}>{grupo.producto || 'Producto'}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                      <Badge color="slate">{CONDICION[grupo.condicion] || grupo.condicion || '—'}</Badge>
                      {vence && <span className={vence.tono}>{vence.texto}</span>}
                      {!vence && <span>Sin fecha prometida</span>}
                    </p>
                  </div>
                  <Badge color={TONO_PRIORIDAD[grupo.prioridad] || 'slate'}>{PRIORIDAD[grupo.prioridad] || grupo.prioridad || 'Normal'}</Badge>
                </div>

                <p className="mt-2 text-sm">
                  Faltan <b className="tabular-nums">{grupo.cantidad}</b> unidad{grupo.cantidad === 1 ? '' : 'es'}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(grupo.destinos || []).map((destino, posicion) => (
                    <span key={`${destino.etiqueta}-${posicion}`} className="rounded-lg border border-ink-600 bg-ink-800/50 px-2 py-1 text-[11px] text-mute">
                      <b className="tabular-nums text-fore">{destino.cantidad}</b> · {DESTINO[destino.tipo] || destino.tipo}: {destino.etiqueta}
                    </span>
                  ))}
                </div>

                {(grupo.origenes || []).length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {grupo.origenes.map((origen) => (
                      <span key={origen} className="rounded-md bg-ink-700/60 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-mute">
                        {ORIGEN[origen] || origen}
                      </span>
                    ))}
                  </p>
                )}

                {vista === 'pendientes' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => { setAsignar(grupo); setComprador('') }}>Asignar comprador</Button>
                    <Button type="button" variant="ghost" className="text-bad" onClick={() => { setCancelar(grupo); setMotivo('') }}>Cancelar</Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={Boolean(asignar)} onClose={() => !busy && setAsignar(null)} title="Asignar comprador" size="corto">
        <p className="mt-2 text-sm text-mute">
          {asignar?.producto} · {asignar?.cantidad} unidad{asignar?.cantidad === 1 ? '' : 'es'} · {PRIORIDAD[asignar?.prioridad] || ''}
        </p>
        <label htmlFor="comprador" className="mt-4 block text-sm font-semibold">Comprador</label>
        <Select id="comprador" className="mt-2 w-full" value={comprador} onChange={(evento) => setComprador(evento.target.value)}>
          <option value="">Elegí quién compra…</option>
          {compradores.map((persona) => <option key={persona.id} value={persona.id}>{persona.name || persona.email}</option>)}
        </Select>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setAsignar(null)} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={confirmarAsignacion} disabled={!comprador || busy}>{busy ? 'Asignando…' : 'Asignar'}</Button>
        </div>
      </Modal>

      <Modal open={Boolean(cancelar)} onClose={() => !busy && setCancelar(null)} title="Cancelar necesidad" size="corto">
        <p className="mt-2 text-sm text-mute">
          {cancelar?.producto} · {cancelar?.cantidad} unidad{cancelar?.cantidad === 1 ? '' : 'es'}. Queda registrado quién la canceló y por qué.
        </p>
        <label htmlFor="motivo" className="mt-4 block text-sm font-semibold">Motivo</label>
        <Input id="motivo" className="mt-2 w-full" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} placeholder="Ej.: se consiguió por otro proveedor" />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setCancelar(null)} disabled={busy}>Volver</Button>
          <Button type="button" variant="danger" onClick={confirmarCancelacion} disabled={motivo.trim().length < 4 || busy}>{busy ? 'Cancelando…' : 'Cancelar necesidad'}</Button>
        </div>
      </Modal>

      <Modal open={agregar} onClose={() => !busy && setAgregar(false)} title="Agregar necesidad" size="amplio">
        <form onSubmit={guardarManual} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold" htmlFor="necesidad-producto">Producto</label>
            <ProductCombobox
              className="mt-1"
              products={getProductos()}
              selectedId={nuevo.productId}
              onSelect={(producto) => setNuevo((actual) => ({ ...actual, productId: producto?.id || '' }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Cantidad</span>
              <Input inputMode="numeric" value={nuevo.quantity} onChange={(evento) => setNuevo((actual) => ({ ...actual, quantity: evento.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Prioridad</span>
              <Select value={nuevo.priority} onChange={(evento) => setNuevo((actual) => ({ ...actual, priority: evento.target.value }))}>
                {Object.entries(PRIORIDAD).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Fecha prometida</span>
              <Input type="date" value={nuevo.promisedAt} onChange={(evento) => setNuevo((actual) => ({ ...actual, promisedAt: evento.target.value }))} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Observaciones</span>
            <Input value={nuevo.notes} onChange={(evento) => setNuevo((actual) => ({ ...actual, notes: evento.target.value }))} placeholder="Color, proveedor, oportunidad…" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAgregar(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={!nuevo.productId || busy}>{busy ? 'Agregando…' : 'Agregar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
