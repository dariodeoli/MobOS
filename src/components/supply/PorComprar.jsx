import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, EmptyState, Input, Modal, Money, Select, Skeleton, Subtabs, useToast } from '@/components/ui'
import ProductCombobox from '@/components/shared/ProductCombobox'
import Icon from '@/components/shared/Icon'

// Abastecimiento · F1 (#250/#254): panel móvil «Por comprar».
// Consume la API de necesidades de INV: consolidado por producto + condición +
// centro de compra, con prioridad efectiva (guardada + regla por promesa),
// costo/margen estimados, destinos (pedido/reserva/stock), cliente (solo quien
// gestiona clientes) y contadores globales para las pestañas y colas del
// comprador. El stock no se toca acá: eso pasa recién en la recepción.

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

// Pestañas por estado (#254): «Por comprar» es lo que falta comprar (sin
// asignar + asignado), tal como define la API de INV.
const ESTADOS = [
  ['pendientes', 'Por comprar'],
  ['asignadas', 'Asignadas'],
  ['compradas', 'Compradas'],
  ['recibidas', 'Recibidas'],
  ['canceladas', 'Canceladas'],
]
const PARAMS_ESTADO = {
  pendientes: {},
  asignadas: { status: 'ASIGNADA' },
  compradas: { status: 'COMPRADA' },
  recibidas: { status: 'RECIBIDA' },
  canceladas: { status: 'CANCELADA' },
}
const VACIO_ESTADO = {
  pendientes: ['No hay nada por comprar.', 'Cuando una venta o reserva necesite stock, la necesidad aparece acá.'],
  asignadas: ['Sin compras asignadas.', 'Asigná un comprador desde «Por comprar» para que aparezca acá.'],
  compradas: ['No hay compras registradas.', 'Lo comprado (fase 2) se lista acá mientras espera la recepción.'],
  recibidas: ['Todavía no hay recepciones.', 'Cuando llegue la compra y se reciba, la necesidad pasa acá.'],
  canceladas: ['No hay necesidades canceladas.', 'Las que se cancelan con motivo quedan acá para la auditoría.'],
}

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
  if (dias < 0) return { vencida: true, texto: `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`, tono: 'font-semibold text-bad' }
  if (dias === 0) return { texto: 'vence hoy', tono: 'font-semibold text-warn' }
  if (dias <= 3) return { texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'text-warn' }
  return { texto: `para el ${fechaCorta(prometidaEl)}`, tono: 'text-mute' }
}

const claveGrupo = (grupo) => `${grupo.productoId}::${grupo.condicion}::${grupo.centro || ''}`

export default function PorComprar() {
  const toast = useToast()
  const esDemo = isDemoRuntime
  const [filas, setFilas] = useState([])
  const [totales, setTotales] = useState(null)
  const [contadores, setContadores] = useState(null)
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('pendientes')
  const [prioridad, setPrioridad] = useState('todas')
  const [centro, setCentro] = useState('todos')
  const [sinAsignar, setSinAsignar] = useState(false)
  const [vencidas, setVencidas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [compradores, setCompradores] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [asignar, setAsignar] = useState(null) // { ids, etiqueta }
  const [comprador, setComprador] = useState('')
  const [centroAsignar, setCentroAsignar] = useState('')
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
      const params = { ...(PARAMS_ESTADO[vista] || {}) }
      if (prioridad !== 'todas') params.priority = prioridad
      if (centro === 'sin-centro') params.sinCentro = 1
      else if (centro !== 'todos') params.origin = centro
      if (sinAsignar) params.sinAsignar = 1
      const datos = await resources.supplyNeeds.list(params)
      setFilas(datos?.grupos || [])
      setTotales(datos?.totales || null)
      setContadores(datos?.contadores || null)
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las necesidades.')
    } finally {
      setCargando(false)
    }
  }, [esDemo, vista, prioridad, centro, sinAsignar])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { setSeleccion([]) }, [vista])
  useEffect(() => {
    if (esDemo) return
    resources.users.list().then((filasUsuarios) => setCompradores((filasUsuarios || []).filter((u) => u.status !== 'INACTIVE'))).catch(() => setCompradores([]))
  }, [esDemo])

  // Centros vistos en la carga actual + los del plan (CDE · USA · Locales) para
  // el filtro y la asignación.
  const centros = useMemo(() => {
    const vistos = new Set(filas.map((fila) => (fila.centro || '').toUpperCase()).filter(Boolean))
    return [...new Set(['CDE', 'USA', 'LOCAL', ...vistos])].sort()
  }, [filas])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return filas.filter((fila) => {
      if (vencidas && !plazo(fila.prometidaEl)?.vencida) return false
      if (!q) return true
      return `${fila.producto || ''} ${fila.condicion || ''} ${fila.cliente || ''}`.toLowerCase().includes(q)
    })
  }, [filas, vencidas, busqueda])

  const seleccionadas = useMemo(() => {
    const claves = new Set(seleccion)
    return visibles.filter((fila) => claves.has(claveGrupo(fila)))
  }, [visibles, seleccion])

  function alternarSeleccion(grupo) {
    const clave = claveGrupo(grupo)
    setSeleccion((actual) => (actual.includes(clave) ? actual.filter((item) => item !== clave) : [...actual, clave]))
  }

  function abrirAsignacion(destino) {
    const grupos = Array.isArray(destino) ? destino : [destino]
    setAsignar({
      ids: grupos.flatMap((grupo) => grupo.necesidades || []),
      etiqueta: grupos.length === 1
        ? `${grupos[0].producto} · ${grupos[0].cantidad} unidad${grupos[0].cantidad === 1 ? '' : 'es'}`
        : `${grupos.length} grupos seleccionados`,
    })
    setComprador('')
    setCentroAsignar(grupos.length === 1 ? (grupos[0].centro || '') : '')
  }

  async function confirmarAsignacion() {
    if (!asignar?.ids?.length || (!comprador && !centroAsignar.trim()) || busy) return
    setBusy(true)
    try {
      const cuerpo = { action: 'assign', ids: asignar.ids }
      if (comprador) cuerpo.assignedToId = comprador
      // La API de INV llama `origin` al centro de compra (el grupo lo devuelve
      // como `centro`).
      if (centroAsignar.trim()) cuerpo.origin = centroAsignar.trim().toUpperCase()
      await resources.supplyNeeds.update(cuerpo)
      toast.success('Compra asignada', `${asignar.etiqueta} quedó actualizada.`)
      setAsignar(null)
      setComprador('')
      setCentroAsignar('')
      setSeleccion([])
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

  const enPendientes = vista === 'pendientes' || vista === 'asignadas'
  const conteoEstado = (id) => {
    if (!contadores) return null
    if (id === 'pendientes') return contadores.pendientes
    return contadores.porEstado?.[PARAMS_ESTADO[id].status] ?? 0
  }
  const chipsCola = [
    ['sin-asignar', `Sin asignar (${contadores?.sinAsignar ?? 0})`, sinAsignar, () => setSinAsignar((valor) => !valor)],
    ['vencidas', `Vencidas (${contadores?.vencidas ?? 0})`, vencidas, () => setVencidas((valor) => !valor)],
  ]

  return (
    <div className="space-y-4" data-testid="por-comprar">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Por comprar</h2>
            <p className="mt-1 text-sm text-mute">
              Lo que falta comprar, consolidado por producto, condición y centro de compra (conserva pedidos, reservas y reposición).
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
            {contadores?.sinCentro > 0 && <Badge color="orange">{contadores.sinCentro} sin centro</Badge>}
            <span>Actualizado {new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <Subtabs
          value={vista}
          onChange={setVista}
          className="mb-0 w-full"
          items={ESTADOS.map(([id, label]) => {
            const conteo = conteoEstado(id)
            return [id, conteo == null ? label : `${label} (${conteo})`]
          })}
        />
        <div className="flex flex-wrap items-center gap-2">
          {chipsCola.map(([id, label, activo, alternar]) => (
            <button
              key={id}
              type="button"
              aria-pressed={activo}
              onClick={alternar}
              className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold transition ${activo ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore'}`}
            >
              {label}
            </button>
          ))}
          <Select aria-label="Prioridad" className="w-auto" value={prioridad} onChange={(evento) => setPrioridad(evento.target.value)}>
            <option value="todas">Todas las prioridades</option>
            {Object.entries(PRIORIDAD).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
          <Select aria-label="Centro de compra" className="w-auto" value={centro} onChange={(evento) => setCentro(evento.target.value)}>
            <option value="todos">Todos los centros</option>
            {centros.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
            <option value="sin-centro">Sin centro</option>
          </Select>
          <Input
            aria-label="Buscar producto"
            placeholder="Buscar producto o cliente…"
            className="min-w-0 flex-1 sm:max-w-xs"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
      </div>

      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fono/40 bg-fono/10 px-3 py-2 text-sm">
          <span className="font-semibold">{seleccionadas.length} grupo{seleccionadas.length === 1 ? '' : 's'} seleccionado{seleccionadas.length === 1 ? '' : 's'}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setSeleccion([])}>Limpiar</Button>
            <Button type="button" onClick={() => abrirAsignacion(seleccionadas)}>Asignar seleccionados</Button>
          </div>
        </div>
      )}

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !filas.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !visibles.length ? (
        <EmptyState
          icon="box"
          title={filas.length || sinAsignar || vencidas ? 'Sin resultados con ese filtro.' : VACIO_ESTADO[vista]?.[0] || 'No hay nada por comprar.'}
          description={filas.length || sinAsignar || vencidas ? 'Probá con otra prioridad, centro o palabra.' : VACIO_ESTADO[vista]?.[1] || 'Cuando una venta o reserva necesite stock, la necesidad aparece acá.'}
        />
      ) : (
        <div className="space-y-2.5">
          {visibles.map((grupo, indice) => {
            const vence = plazo(grupo.prometidaEl)
            const clave = claveGrupo(grupo)
            const marcado = seleccion.includes(clave)
            return (
              <Card key={`${clave}-${indice}`} className="p-3.5" data-testid="por-comprar-fila">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {enPendientes && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        aria-label={`Seleccionar ${grupo.producto || 'el producto'}`}
                        checked={marcado}
                        onChange={() => alternarSeleccion(grupo)}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={grupo.producto}>{grupo.producto || 'Producto'}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                        <Badge color="slate">{CONDICION[grupo.condicion] || grupo.condicion || '—'}</Badge>
                        <Badge color={grupo.centro ? 'blue' : 'orange'}>{grupo.centro || 'Sin centro'}</Badge>
                        {vence && <span className={vence.tono}>{vence.texto}</span>}
                        {!vence && <span>Sin fecha prometida</span>}
                      </p>
                    </div>
                  </div>
                  <Badge color={TONO_PRIORIDAD[grupo.prioridad] || 'slate'}>{PRIORIDAD[grupo.prioridad] || grupo.prioridad || 'Normal'}</Badge>
                </div>

                <p className="mt-2 text-sm">
                  Faltan <b className="tabular-nums">{grupo.cantidad}</b> unidad{grupo.cantidad === 1 ? '' : 'es'}
                  {grupo.costoEstimadoPyg != null && <> · costo <Money value={grupo.costoEstimadoPyg} className="text-sm" /></>}
                  {grupo.margenEstimadoPyg != null && <> · margen <Money value={grupo.margenEstimadoPyg} className="text-sm" /></>}
                </p>

                {grupo.cliente && <p className="mt-1 text-xs text-mute">Cliente: <b className="text-fore">{grupo.cliente}</b></p>}

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

                {enPendientes && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => abrirAsignacion(grupo)}>Asignar comprador</Button>
                    <Button type="button" variant="ghost" className="text-bad" onClick={() => { setCancelar(grupo); setMotivo('') }}>Cancelar</Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={Boolean(asignar)} onClose={() => !busy && setAsignar(null)} title="Asignar compra" size="corto">
        <p className="mt-2 text-sm text-mute">{asignar?.etiqueta}</p>
        <label htmlFor="comprador" className="mt-4 block text-sm font-semibold">Comprador</label>
        <Select id="comprador" className="mt-2 w-full" value={comprador} onChange={(evento) => setComprador(evento.target.value)}>
          <option value="">Sin cambio de comprador…</option>
          {compradores.map((persona) => <option key={persona.id} value={persona.id}>{persona.name || persona.email}</option>)}
        </Select>
        <label htmlFor="centro-compra" className="mt-3 block text-sm font-semibold">Centro de compra</label>
        <Input
          id="centro-compra"
          list="centros-compra"
          className="mt-2 w-full"
          placeholder="CDE · USA · LOCAL…"
          value={centroAsignar}
          onChange={(evento) => setCentroAsignar(evento.target.value)}
        />
        <datalist id="centros-compra">
          {centros.map((valor) => <option key={valor} value={valor} />)}
        </datalist>
        <p className="mt-2 text-xs text-mute">Con comprador o centro alcanza; los dos quedan auditados.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setAsignar(null)} disabled={busy}>Volver</Button>
          <Button type="button" onClick={confirmarAsignacion} disabled={(!comprador && !centroAsignar.trim()) || busy}>{busy ? 'Asignando…' : 'Asignar'}</Button>
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
