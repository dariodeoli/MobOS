import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '@/components/shared/BottomSheet'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import './compras.css'
import { Checkbox } from 'owncoding-ui'
import { resources } from '@/lib/api'
import { contextoActual, getProductos } from '@/lib/storage'
import { suppliersApi } from '@/lib/api/suppliers'
import { leerProveedoresRecientes, recordarProveedorReciente } from '@/lib/proveedores'
import { Badge, Button, Card, EmptyState, Input, Money, MoneyInput, Select, Skeleton, Stat, Subtabs, useToast } from '@/components/ui'
import Toolbar from '@/components/shared/Toolbar'
import SearchField from '@/components/shared/SearchField'
import StatGrid from '@/components/shared/StatGrid'
import '@/components/ventas/ventasF3.css'
import '@/components/shared/gestionProfundo.css'
import Popup from '@/components/shared/Popup'
import ProductCombobox from '@/components/shared/ProductCombobox'
import SupplierCombobox from '@/components/shared/SupplierCombobox'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import Icon from '@/components/shared/Icon'
import { CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { useStockDisplay } from '@/hooks/useStockDisplay'
import { estiloCondicion } from '@/lib/stockDisplay'
import { familiaCondicion } from '@/lib/planilla'
import '@/components/stock/planilla.css'

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
  compradas: ['No hay compras registradas.', 'Lo que comprás sale de «Por comprar» y se lista acá mientras espera la recepción; sus IMEI se cargan en «Preparar compra».'],
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
  const navigate = useNavigate()
  const { colores } = useStockDisplay()
  // #450: lo recién comprado no desaparece en silencio: queda el aviso con el enlace a su compra.
  const [recienComprada, setRecienComprada] = useState(null)
  const toast = useToast()
  const [filas, setFilas] = useState([])
  const [totales, setTotales] = useState(null)
  const [contadores, setContadores] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('pendientes')
  const movil = usePantallaAngosta('(min-width: 768px)')
  const [verFiltros, setVerFiltros] = useState(false)
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
  // #250 F2: compra adicional (reposición libre, sin cliente ni necesidad).
  const [libre, setLibre] = useState(false)
  const [libreForm, setLibreForm] = useState({ productId: '', quantity: '1', unitCostPyg: '', supplierName: '' })
  const [recientesProveedores, setRecientesProveedores] = useState(() => leerProveedoresRecientes(contextoActual().empresaId))
  const [proveedores, setProveedores] = useState([])
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
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
  }, [vista, prioridad, centro, sinAsignar])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    suppliersApi.list().then((filas) => setProveedores(Array.isArray(filas) ? filas : [])).catch(() => {})
  }, [])
  useEffect(() => { setSeleccion([]) }, [vista])
  useEffect(() => {
    resources.users.list().then((filasUsuarios) => setCompradores((filasUsuarios || []).filter((u) => u.status !== 'INACTIVE'))).catch(() => setCompradores([]))
  }, [])

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

  async function guardarCompraLibre(evento) {
    evento.preventDefault()
    const cantidad = Number(libreForm.quantity) || 0
    const costo = Number(String(libreForm.unitCostPyg).replace(/\D/g, '')) || 0
    if (!libreForm.productId || !libreForm.supplierName.trim() || cantidad < 1 || busy) return
    setBusy(true)
    try {
      const creada = await resources.supplyPurchases.create({
        supplierName: libreForm.supplierName.trim(),
        currency: 'PYG',
        ...(costo > 0 ? { originalCost: cantidad * costo } : {}),
        lines: [{ productId: libreForm.productId, quantity: cantidad, ...(costo > 0 ? { unitCostPyg: costo } : {}) }],
      })
      toast.success('Compra libre registrada', 'No crea necesidad: el stock entra al recibirla.')
      setRecienComprada({ code: creada?.code || '', unidades: cantidad })
      setLibre(false)
      setLibreForm({ productId: '', quantity: '1', unitCostPyg: '', supplierName: '' })
      cargar()
    } catch (causa) {
      toast.error('No se pudo registrar', causa?.message || 'Revisá el producto, el proveedor y la cantidad.')
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
  const filtrosActivos = Number(sinAsignar) + Number(vencidas) + Number(prioridad !== 'todas') + Number(centro !== 'todos')
  const camposFiltros = (
    <>
      {chipsCola.map(([id, label, activo, alternar]) => (
        <button key={id} type="button" aria-pressed={activo} onClick={alternar}
          className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition ${activo ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore'}`}>
          {label}
        </button>
      ))}
      <label className="grid gap-1 text-xs text-mute">
        <span>Prioridad</span>
        <Select aria-label="Prioridad" className="w-full" value={prioridad} onChange={evento => setPrioridad(evento.target.value)}>
          <option value="todas">Todas las prioridades</option>
          {Object.entries(PRIORIDAD).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-mute">
        <span>Centro de compra</span>
        <Select aria-label="Centro de compra" className="w-full" value={centro} onChange={evento => setCentro(evento.target.value)}>
          <option value="todos">Todos los centros</option>
          {centros.map(valor => <option key={valor} value={valor}>{valor}</option>)}
          <option value="sin-centro">Sin centro</option>
        </Select>
      </label>
    </>
  )


  return (
    <div className="compras-flujo gp ventas-f3 space-y-4" data-testid="por-comprar">
      <Toolbar
        plano
        lista
        label="Acciones de Por comprar"
        testId="barra-por-comprar"
        className="ventas-f3-toolbar"
        search={(
          <SearchField
            ariaLabel="Buscar producto"
            placeholder="Buscar producto o cliente…"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        )}
        filters={(
          <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Subtabs
              value={vista}
              onChange={setVista}
              className="mb-0 w-max min-w-full flex-nowrap"
              items={ESTADOS.map(([id, label]) => {
                const conteo = conteoEstado(id)
                return [id, conteo == null ? label : `${label} (${conteo})`]
              })}
            />
          </div>
        )}
        more={(
          <>
            <Button type="button" variant="outline" onClick={cargar} disabled={cargando} aria-label="Actualizar">
              <Icon name="refresh" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Actualizar</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setLibre(true)}>+ Compra libre</Button>
          </>
        )}
        primary={<Button type="button" onClick={() => setAgregar(true)}>+ Agregar necesidad</Button>}
      >
        {movil ? (
          <Button type="button" variant="outline" aria-expanded={verFiltros} onClick={() => setVerFiltros(true)}>
            <Icon name="filter" className="h-4 w-4" />Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </Button>
        ) : camposFiltros}
      </Toolbar>
      {totales && (
        <StatGrid testId="por-comprar-resumen" etiqueta="Resumen de lo que hay que comprar">
          <Stat compact label="Grupos" valor={totales.grupos} />
          <Stat compact label="Unidades" valor={totales.unidades} />
          {contadores?.sinCentro > 0 && <Stat compact label="Sin centro" valor={contadores.sinCentro} valorClassName="text-warn" />}
          <Stat compact label="Actualizado" valor={new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })} />
        </StatGrid>
      )}

      {recienComprada && (
        <div role="status" data-testid="por-comprar-comprado" className="flex flex-wrap items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Comprado{recienComprada.code ? ` · ${recienComprada.code}` : ''} · {recienComprada.unidades} unidad(es). Ya no está en «Por comprar»: sus IMEI quedan pendientes.</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => navigate(recienComprada.code ? `/preparacion?compra=${encodeURIComponent(recienComprada.code)}` : '/preparacion')}>Ver en Preparar compra</Button>
          <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="Cerrar aviso" onClick={() => setRecienComprada(null)}><Icon name="close" className="h-4 w-4" /></Button>
        </div>
      )}

      {movil && (
        <BottomSheet open={verFiltros} onClose={() => setVerFiltros(false)} title="Filtros de compras"
          footer={<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => { setSinAsignar(false); setVencidas(false); setPrioridad('todas'); setCentro('todos') }}>Limpiar filtros</Button><Button type="button" onClick={() => setVerFiltros(false)}>Ver resultados</Button></div>}>
          <div className="grid gap-3">{camposFiltros}</div>
        </BottomSheet>
      )}

      {seleccionadas.length > 0 && (
        <div data-testid="seleccion-lote" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fono/40 bg-fono/10 px-3 py-2 text-sm">
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
          action={filas.length ? undefined : <Button type="button" onClick={() => setAgregar(true)}>+ Agregar necesidad</Button>}
        />
      ) : (
        <div className="space-y-1.5">
          {visibles.map((grupo, indice) => {
            const vence = plazo(grupo.prometidaEl)
            const clave = claveGrupo(grupo)
            const marcado = seleccion.includes(clave)
            return (
              <div
                key={`${clave}-${indice}`}
                data-testid="por-comprar-fila"
                data-condicion={familiaCondicion({ condition: grupo.condicion })}
                data-propio={estiloCondicion({ condition: grupo.condicion }, colores) ? 'true' : undefined}
                style={estiloCondicion({ condition: grupo.condicion }, colores)}
                className="cond-color grid items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 lg:grid-cols-[minmax(0,1fr)_5.5rem_10rem_auto]"
              >
                <div className="flex min-w-0 items-start gap-2">
                  {enPendientes && (
                    <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                      <Checkbox ariaLabel={`Seleccionar ${grupo.producto || 'el producto'}`} checked={marcado} onChange={() => alternarSeleccion(grupo)} />
                    </label>
                  )}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className={cn(CELDA_IDENTIDAD, 'max-w-full')} title={grupo.producto}>{grupo.producto || 'Producto'}</p>
                    <Badge color="slate">{CONDICION[grupo.condicion] || grupo.condicion || '—'}</Badge>
                    <Badge color={grupo.centro ? 'blue' : 'orange'}>{grupo.centro || 'Sin centro'}</Badge>
                    {vence ? <span className={cn('whitespace-nowrap text-xs', vence.tono)}>{vence.texto}</span> : <span className="pl-sec whitespace-nowrap text-xs">Sin fecha prometida</span>}
                    {grupo.cliente && <span className="pl-sec truncate text-xs" title={grupo.cliente}>· <b>{grupo.cliente}</b></span>}
                  </div>
                </div>

                <p className="flex items-baseline gap-1.5 whitespace-nowrap text-sm lg:justify-center" data-testid="por-comprar-faltan">
                  <span className="pl-sec text-xs">Faltan</span>
                  <b className="text-base tabular-nums">{grupo.cantidad}</b>
                </p>

                <p className="flex flex-wrap items-baseline gap-x-2 text-sm lg:block lg:text-right">
                  {grupo.costoEstimadoPyg != null ? <span className="block whitespace-nowrap"><span className="pl-sec text-[11px]">costo </span><Money value={grupo.costoEstimadoPyg} className="text-sm" /></span> : <span className="pl-sec text-xs">Sin costo</span>}
                  {grupo.margenEstimadoPyg != null && <span className="block whitespace-nowrap"><span className="pl-sec text-[11px]">margen </span><Money value={grupo.margenEstimadoPyg} className="text-xs" /></span>}
                </p>

                <div className="flex min-w-0 flex-wrap items-center gap-1 lg:order-last lg:col-span-full" data-testid="por-comprar-motivos">
                  {(grupo.destinos || []).map((destino, posicion) => (
                    <span key={`${destino.etiqueta}-${posicion}`} className="max-w-full truncate rounded-md border border-ink-600 bg-ink/60 px-1.5 py-0.5 text-[11px] text-mute" title={`${destino.cantidad} · ${DESTINO[destino.tipo] || destino.tipo}: ${destino.etiqueta}`}>
                      <b className="tabular-nums text-fore">{destino.cantidad}</b> · {DESTINO[destino.tipo] || destino.tipo}: {destino.etiqueta}
                    </span>
                  ))}
                  {(grupo.origenes || []).map((origen) => (
                    <span key={origen} className="rounded-md bg-ink-700/70 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-mute">
                      {ORIGEN[origen] || origen}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                  <Badge color={TONO_PRIORIDAD[grupo.prioridad] || 'slate'}>{PRIORIDAD[grupo.prioridad] || grupo.prioridad || 'Normal'}</Badge>
                  {(vista === 'compradas' || vista === 'recibidas') && (
                    <>
                      <Badge color="green">{vista === 'compradas' ? 'Comprado' : 'Recibido'}</Badge>
                      <Button type="button" variant="outline" className="min-h-11 px-2.5 text-xs lg:!h-8 lg:!min-h-0" onClick={() => navigate(vista === 'compradas' ? '/preparacion' : '/stock/unidades')} data-testid="por-comprar-ver-compra">
                        {vista === 'compradas' ? 'Ver en Preparar compra' : 'Ver en Stock'}
                      </Button>
                    </>
                  )}
                  {enPendientes && (
                    <>
                      <Button type="button" variant="outline" className="min-h-11 px-2.5 text-xs lg:!h-8 lg:!min-h-0" onClick={() => abrirAsignacion(grupo)}>Asignar comprador</Button>
                      <Button type="button" variant="ghost" className="min-h-11 px-2.5 text-xs text-bad lg:min-h-8" onClick={() => { setCancelar(grupo); setMotivo('') }}>Cancelar</Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Popup open={Boolean(asignar)} onClose={() => !busy && setAsignar(null)} title="Asignar compra" tamano="sm">
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
      </Popup>

      <Popup open={Boolean(cancelar)} onClose={() => !busy && setCancelar(null)} title="Cancelar necesidad" tamano="sm">
        <p className="mt-2 text-sm text-mute">
          {cancelar?.producto} · {cancelar?.cantidad} unidad{cancelar?.cantidad === 1 ? '' : 'es'}. Queda registrado quién la canceló y por qué.
        </p>
        <label htmlFor="motivo" className="mt-4 block text-sm font-semibold">Motivo</label>
        <Input id="motivo" className="mt-2 w-full" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} placeholder="Ej.: se consiguió por otro proveedor" />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setCancelar(null)} disabled={busy}>Volver</Button>
          <Button type="button" variant="danger" onClick={confirmarCancelacion} disabled={motivo.trim().length < 4 || busy}>{busy ? 'Cancelando…' : 'Cancelar necesidad'}</Button>
        </div>
      </Popup>

      <Popup open={libre} onClose={() => !busy && setLibre(false)} title="Compra libre (reposición)" tamano="lg">
        <form onSubmit={guardarCompraLibre} className="space-y-3">
          <p className="text-sm text-mute">
            Reposición adicional <b>sin cliente ni necesidad</b>: no aparece en «Por comprar» y el stock se suma recién al
            recibirla. Los IMEI se cargan acá o después, en «Preparar compra»/«Preparar lote».
          </p>
          <div>
            <label className="block text-sm font-semibold" htmlFor="libre-producto">Producto</label>
            <ProductCombobox
              className="mt-1"
              products={getProductos()}
              selectedId={libreForm.productId}
              onSelect={(producto) => setLibreForm((actual) => ({ ...actual, productId: producto?.id || '' }))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="libre-proveedor">Proveedor</label>
            <SupplierCombobox
              id="libre-proveedor"
              ariaLabel="Proveedor de la compra libre"
              proveedores={proveedores}
              value={libreForm.supplierName}
              recientes={recientesProveedores}
              onSelect={(proveedor) => {
                setLibreForm((actual) => ({ ...actual, supplierName: proveedor.name }))
                setRecientesProveedores(recordarProveedorReciente(contextoActual().empresaId, proveedor.id))
              }}
              onLibre={(texto) => setLibreForm((actual) => ({ ...actual, supplierName: texto }))}
              confirmarAlTipear
              placeholder="Elegí uno o escribí el nombre"
            />
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Cantidad</span>
              <Input inputMode="numeric" value={libreForm.quantity} onChange={(evento) => setLibreForm((actual) => ({ ...actual, quantity: evento.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Costo unitario (Gs., opcional)</span>
              <MoneyInput aria-label="Costo unitario de la compra libre" value={libreForm.unitCostPyg} onValueChange={(valor) => setLibreForm((actual) => ({ ...actual, unitCostPyg: valor === '' ? '' : String(valor) }))} placeholder="Ej. 1500000" />
            </label>
          </div>
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="outline" onClick={() => setLibre(false)} disabled={busy}>Volver</Button>
            <Button type="submit" disabled={busy || !libreForm.productId || !libreForm.supplierName.trim() || Number(libreForm.quantity) < 1}>{busy ? 'Registrando…' : 'Registrar compra libre'}</Button>
          </div>
        </form>
      </Popup>

      <Popup open={agregar} onClose={() => !busy && setAgregar(false)} title="Agregar necesidad" tamano="lg">
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
      </Popup>
    </div>
  )
}
