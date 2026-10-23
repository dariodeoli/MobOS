import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Checkbox } from 'owncoding-ui'
import { resources } from '@/lib/api'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { contextoActual } from '@/lib/storage'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { suppliersApi } from '@/lib/api/suppliers'
import { leerProveedoresRecientes, recordarProveedorReciente } from '@/lib/proveedores'
import { Badge, Button, EmptyState, Input, Money, MoneyInput, Select, Skeleton, useToast } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import SupplierCombobox from '@/components/shared/SupplierCombobox'
import { cn } from '@/lib/utils'
import { ESTADO_LABEL, ESTADO_TONO, FILTROS_VENTAS, PASO_LABEL, contarVentas, filtrarVentas, plazoPrometido } from '@/lib/ventaSinStock'

// Venta sin stock · seguimiento de lo vendido sin tener el producto (mobile first).
// Una fila por venta; cada fila muestra el cliente, el pedido, la fecha prometida,
// su estado y UNA acción principal: Comprar → Cargar costo → Marcar pagado →
// Recibido → Avisar al cliente → Entregar. El costo es siempre opcional al comprar
// y llega a la venta original al cargarse. Nada se envía solo: el aviso al cliente
// lo manda el encargado por WhatsApp.

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const digitos = (valor) => String(valor ?? '').replace(/\D/g, '')

function puedeFinanzasUI() {
  const { rol, permisos } = contextoActual()
  if (Array.isArray(permisos) && permisos.length) return permisos.includes('*') || permisos.includes('cash:manage')
  return ['dueno', 'ADMIN', 'GERENTE'].includes(rol)
}

export default function VentasSinStock({ onCambio }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [lineas, setLineas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [hoja, setHoja] = useState(null) // { tipo, linea }
  const [busy, setBusy] = useState(false)
  const [cuentas, setCuentas] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [recientes, setRecientes] = useState(() => leerProveedoresRecientes(contextoActual().empresaId))
  const finanzas = puedeFinanzasUI()

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const datos = await resources.supplyNeeds.list({ detalle: 1, estados: 'ABIERTA,ASIGNADA,COMPRADA,RECIBIDA' })
      setLineas(Array.isArray(datos?.lineas) ? datos.lineas : [])
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las ventas sin stock.')
    } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    suppliersApi.list().then((filas) => setProveedores(Array.isArray(filas) ? filas : [])).catch(() => {})
    if (finanzas) getPaymentAccounts().then((filas) => setCuentas((filas || []).filter((cuenta) => cuenta.isActive !== false && (cuenta.currency || 'PYG') === 'PYG'))).catch(() => {})
  }, [finanzas])

  const conteo = useMemo(() => contarVentas(lineas), [lineas])
  const visibles = useMemo(() => filtrarVentas(lineas, filtro, busqueda), [lineas, filtro, busqueda])

  async function tras(mensaje, detalle) {
    toast.success(mensaje, detalle)
    setHoja(null)
    await cargar()
    onCambio?.()
  }
  async function ejecutar(accion, fallo) {
    if (busy) return
    setBusy(true)
    try { await accion() } catch (causa) { toast.error(fallo, causa?.message || 'Reintentá en un momento.') } finally { setBusy(false) }
  }

  async function avisar(linea) {
    if (busy) return
    setBusy(true)
    try {
      if (isDemoRuntime) {
        await resources.supplyNeeds.update({ id: linea.id, action: 'notified' })
        toast.success('Aviso registrado', 'En la demo no se abre WhatsApp: así se vería el mensaje «Llegó tu producto».')
      } else {
        const respuesta = await api.post(`/api/orders/${encodeURIComponent(linea.pedidoId)}/whatsapp-message`, { templateKey: 'backorder_llego' })
        if (respuesta?.whatsappUrl) window.open(respuesta.whatsappUrl, '_blank', 'noopener,noreferrer')
        toast.success('Aviso preparado', 'Enviá el mensaje desde WhatsApp: queda registrado que avisaste.')
      }
      setHoja(null)
      await cargar()
      onCambio?.()
    } catch (causa) {
      toast.error('No se pudo preparar el aviso', causa?.message || 'Revisá que el cliente tenga teléfono cargado.')
    } finally { setBusy(false) }
  }

  function accionPrincipal(linea) {
    switch (linea.siguientePaso) {
      case 'COMPRAR': return setHoja({ tipo: 'comprar', linea })
      case 'CARGAR_COSTO': return setHoja({ tipo: 'costo', linea })
      case 'MARCAR_PAGADO': return setHoja({ tipo: 'pagar', linea })
      case 'RECIBIDO': return linea.conImei ? navigate('/recepcion') : setHoja({ tipo: 'recibir', linea })
      case 'AVISAR': return avisar(linea)
      case 'ENTREGAR': return navigate(`/pedidos/${encodeURIComponent(linea.pedidoId)}`)
      default: return undefined
    }
  }

  return (
    <section className="space-y-3" data-testid="ventas-sin-stock">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <SearchField ariaLabel="Buscar venta sin stock" placeholder="Producto, cliente o pedido…" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTROS_VENTAS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filtro === id} data-testid={`filtro-${id}`} onClick={() => setFiltro(id)}
              className={cn('min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition', filtro === id ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore')}>
              {label} ({conteo[id] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {cargando && !lineas.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !visibles.length ? (
        <EmptyState icon="box" title={lineas.length ? 'Sin resultados con ese filtro.' : 'No hay ventas sin stock.'}
          description={lineas.length ? 'Probá con otro estado o palabra.' : 'Cuando vendas «sobre pedido» un producto que no tenés, aparece acá con su seguimiento.'} />
      ) : (
        <ul className="space-y-2" aria-label="Ventas sin stock">
          {visibles.map((linea) => {
            const plazo = plazoPrometido(linea.prometidaEl)
            const paso = linea.siguientePaso
            return (
              <li key={linea.id} data-testid="venta-sin-stock-fila" data-estado={linea.estado} data-paso={paso || ''}
                className="grid items-center gap-x-3 gap-y-2 rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 max-w-full truncate text-sm font-semibold" title={linea.producto}>{linea.producto || 'Producto'}</p>
                    <Badge color="slate">{CONDICION[linea.condicion] || linea.condicion}</Badge>
                    {linea.estado && <Badge color={ESTADO_TONO[linea.estado] || 'slate'} data-testid="venta-sin-stock-estado">{ESTADO_LABEL[linea.estado]}</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-mute">
                    {linea.cliente && <span className="truncate font-medium text-fore">{linea.cliente}</span>}
                    {linea.pedidoNumero && <span>· Pedido {linea.pedidoNumero}</span>}
                    {plazo ? <span className={cn('whitespace-nowrap', plazo.tono)}>· {plazo.texto}</span> : <span>· Sin fecha prometida</span>}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  <span className="whitespace-nowrap text-mute">{linea.estado === 'PENDIENTE_COMPRA' ? 'Faltan' : 'Esperando'} <b className="tabular-nums text-fore">{linea.estado === 'PENDIENTE_COMPRA' ? linea.porComprar : linea.pendientes}</b></span>
                  {linea.faltaCosto && <Badge color="orange" data-testid="chip-falta-costo">Falta costo</Badge>}
                  {linea.pagado && !linea.pagoSinCuenta && <Badge color="green">Pagado</Badge>}
                  {linea.pagoSinCuenta && <Badge color="orange" title="Finanzas asigna la cuenta">Pagado · sin cuenta</Badge>}
                  {linea.credito && !linea.pagado && <Badge color="slate">A crédito</Badge>}
                  {linea.avisadoEl && <Badge color="green">Avisado</Badge>}
                  {linea.compra?.code && <span className="whitespace-nowrap text-mute">{linea.compra.code}</span>}
                  {linea.costoUnitarioPyg != null && <span className="whitespace-nowrap text-mute">costo <Money value={linea.costoUnitarioPyg} className="text-xs" /></span>}
                </div>
                <div className="flex items-center gap-2 lg:col-span-2 lg:justify-end">
                  {paso && (
                    <Button type="button" className="min-h-11 flex-1 lg:flex-none" data-testid="venta-sin-stock-principal" disabled={busy} onClick={() => accionPrincipal(linea)}>
                      {PASO_LABEL[paso]}
                    </Button>
                  )}
                  <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" aria-label={`Más acciones de ${linea.producto || 'la venta'}`} data-testid="venta-sin-stock-mas" onClick={() => setHoja({ tipo: 'mas', linea })}>
                    <Icon name="dots" className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <HojaMas hoja={hoja} onClose={() => setHoja(null)} onAbrir={(tipo, linea) => (tipo === 'avisar' ? avisar(linea) : tipo === 'pedido' ? navigate(`/pedidos/${encodeURIComponent(linea.pedidoId)}`) : tipo === 'ya-avise' ? ejecutar(async () => { await resources.supplyNeeds.update({ id: linea.id, action: 'notified' }); await tras('Aviso registrado') }, 'No se pudo registrar') : setHoja({ tipo, linea }))} />
      <HojaComprar hoja={hoja} busy={busy} finanzas={finanzas} cuentas={cuentas} proveedores={proveedores} recientes={recientes}
        onProveedorUsado={(proveedor) => setRecientes(recordarProveedorReciente(contextoActual().empresaId, proveedor.id))}
        onClose={() => !busy && setHoja(null)}
        onConfirm={(linea, datos) => ejecutar(async () => {
          const creada = await resources.supplyPurchases.create({
            supplierName: datos.proveedor, currency: 'PYG', paymentCondition: datos.condicion,
            ...(datos.condicion === 'CREDITO' ? { dueAt: new Date(`${datos.vencimiento}T12:00:00`).toISOString() } : {}),
            ...(datos.yaPagado ? { yaPagado: true, ...(datos.cuenta ? { accountId: datos.cuenta } : {}) } : {}),
            lines: [{ needId: linea.id, productId: linea.productoId, condition: linea.condicion, quantity: datos.cantidad, ...(datos.costo > 0 ? { unitCostPyg: datos.costo } : {}) }],
          })
          await tras('Compra registrada', `${creada?.code || 'Compra'} · ${datos.costo > 0 ? 'con costo cargado' : 'sin costo: cargalo cuando tengas la factura'}.`)
        }, 'No se pudo registrar la compra')} />
      <HojaCosto hoja={hoja} busy={busy} onClose={() => !busy && setHoja(null)}
        onConfirm={(linea, costo) => ejecutar(async () => {
          await resources.supplyPurchases.update({ id: linea.compra.id, action: 'setCost', unitCostPyg: costo })
          await tras('Costo cargado', 'Llegó a la venta original: el margen queda en la fecha de la venta.')
        }, 'No se pudo cargar el costo')} />
      <HojaPagar hoja={hoja} busy={busy} finanzas={finanzas} cuentas={cuentas} onClose={() => !busy && setHoja(null)}
        onConfirm={(linea, cuenta) => ejecutar(async () => {
          await resources.supplyPurchases.update({ id: linea.compra.id, action: 'markPaid', ...(cuenta ? { accountId: cuenta } : {}) })
          await tras('Compra pagada', cuenta ? 'Quedó la salida de la cuenta elegida.' : 'Quedó «ya pagado»: Finanzas asigna la cuenta.')
        }, 'No se pudo marcar pagado')} />
      <HojaRecibir hoja={hoja} busy={busy} onClose={() => !busy && setHoja(null)}
        onConfirm={(linea, cantidad) => ejecutar(async () => {
          const resultado = await resources.supplyReceptions.create({ action: 'receiveQuick', needId: linea.id, quantity: cantidad })
          await tras(resultado?.llegoTodo ? 'Llegó todo' : 'Recepción registrada', resultado?.llegoTodo ? 'Ya podés avisarle al cliente.' : `Quedan ${resultado?.restantes ?? 0} por llegar.`)
        }, 'No se pudo registrar la llegada')} />
    </section>
  )
}

function HojaMas({ hoja, onClose, onAbrir }) {
  const linea = hoja?.linea
  const abierta = hoja?.tipo === 'mas'
  const acciones = linea ? [
    linea.compra && ['costo', linea.faltaCosto ? 'Cargar costo' : 'Corregir costo', !linea.pagado],
    linea.compra && !linea.pagado && !linea.faltaCosto && ['pagar', 'Marcar pagado', true],
    linea.compra && linea.estado !== 'LLEGO' && ['recibir', 'Recibido', true],
    linea.estado === 'LLEGO' && ['avisar', 'Avisar al cliente', true],
    linea.estado === 'LLEGO' && !linea.avisadoEl && ['ya-avise', 'Ya avisé al cliente', true],
    linea.pedidoId && ['pedido', 'Ver pedido', true],
  ].filter((fila) => fila && fila[2]) : []
  return (
    <Popup open={abierta} onClose={onClose} title="Más acciones" tamano="sm">
      <p className="mt-1 text-sm text-mute">{linea?.producto}{linea?.cliente ? ` · ${linea.cliente}` : ''}</p>
      <div className="mt-3 grid gap-2">
        {acciones.map(([tipo, etiqueta]) => (
          <Button key={tipo} type="button" variant="outline" className="min-h-11 justify-start" onClick={() => onAbrir(tipo, linea)}>{etiqueta}</Button>
        ))}
        {!acciones.length && <p className="text-sm text-mute">No hay más acciones para esta venta.</p>}
      </div>
    </Popup>
  )
}

function Pie({ busy, onClose, deshabilitado, texto, textoBusy }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Volver</Button>
      <Button type="submit" disabled={busy || deshabilitado}>{busy ? textoBusy : texto}</Button>
    </div>
  )
}

function HojaComprar({ hoja, busy, finanzas, cuentas, proveedores, recientes, onProveedorUsado, onClose, onConfirm }) {
  const linea = hoja?.linea
  const abierta = hoja?.tipo === 'comprar'
  const [proveedor, setProveedor] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [costo, setCosto] = useState('')
  const [condicion, setCondicion] = useState('CONTADO')
  const [vencimiento, setVencimiento] = useState('')
  const [yaPagado, setYaPagado] = useState(false)
  const [cuenta, setCuenta] = useState('')
  useEffect(() => {
    if (abierta) { setProveedor(''); setCantidad(String(linea?.porComprar || 1)); setCosto(''); setCondicion('CONTADO'); setVencimiento(''); setYaPagado(false); setCuenta('') }
  }, [abierta, linea?.id, linea?.porComprar])
  const costoNumero = Number(digitos(costo)) || 0
  const cantidadNumero = Number(digitos(cantidad)) || 0
  const puedePagar = condicion === 'CONTADO' && costoNumero > 0
  const invalido = !proveedor.trim() || cantidadNumero < 1 || (condicion === 'CREDITO' && !vencimiento) || (yaPagado && finanzas && !cuenta)
  return (
    <Popup open={abierta} onClose={onClose} title="Comprar" tamano="md" testId="hoja-comprar">
      <form onSubmit={(evento) => { evento.preventDefault(); if (!invalido) onConfirm(linea, { proveedor: proveedor.trim(), cantidad: cantidadNumero, costo: costoNumero, condicion, vencimiento, yaPagado: yaPagado && puedePagar, cuenta: yaPagado && finanzas ? cuenta : '' }) }} className="space-y-3">
        <p className="text-sm text-mute"><b className="text-fore">{linea?.producto}</b> · {linea?.cliente || 'sin cliente'} · faltan {linea?.porComprar}</p>
        <div>
          <label className="block text-sm font-semibold" htmlFor="compra-proveedor">Proveedor</label>
          <SupplierCombobox id="compra-proveedor" ariaLabel="Proveedor de la compra" proveedores={proveedores} value={proveedor} recientes={recientes}
            onSelect={(elegido) => { setProveedor(elegido.name || elegido.nombre || ''); onProveedorUsado?.(elegido) }} onLibre={(texto) => setProveedor(texto)} confirmarAlTipear placeholder="Elegí uno o escribí el nombre" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm"><span className="font-semibold">Cantidad</span>
            <Input inputMode="numeric" aria-label="Cantidad a comprar" value={cantidad} onChange={(evento) => setCantidad(digitos(evento.target.value).slice(0, 4))} /></label>
          <label className="block space-y-1 text-sm"><span className="font-semibold">Costo unitario (Gs., opcional)</span>
            <MoneyInput aria-label="Costo unitario" value={costo} onValueChange={(valor) => setCosto(valor === '' ? '' : String(valor))} placeholder="Podés cargarlo después" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm"><span className="font-semibold">Pago</span>
            <Select aria-label="Condición de pago" value={condicion} onChange={(evento) => { setCondicion(evento.target.value); if (evento.target.value !== 'CONTADO') setYaPagado(false) }}>
              <option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option>
            </Select></label>
          {condicion === 'CREDITO' && (
            <label className="block space-y-1 text-sm"><span className="font-semibold">Vencimiento</span>
              <Input type="date" aria-label="Vencimiento" value={vencimiento} onChange={(evento) => setVencimiento(evento.target.value)} /></label>
          )}
        </div>
        <label className={cn('flex min-h-11 items-center gap-2 text-sm', !puedePagar && 'opacity-60')}>
          <Checkbox ariaLabel="Ya lo pagué" checked={yaPagado && puedePagar} disabled={!puedePagar} onChange={() => setYaPagado((valor) => !valor)} />
          <span>Ya lo pagué{!puedePagar ? ' (contado y con costo)' : ''}</span>
        </label>
        {yaPagado && puedePagar && (finanzas ? (
          <label className="block space-y-1 text-sm"><span className="font-semibold">¿De qué cuenta salió la plata?</span>
            <Select aria-label="Cuenta de origen" value={cuenta} onChange={(evento) => setCuenta(evento.target.value)}>
              <option value="">Elegí la cuenta…</option>
              {cuentas.map((fila) => <option key={fila.id} value={fila.id}>{fila.name}</option>)}
            </Select></label>
        ) : <p className="rounded-lg border border-ink-600 px-3 py-2 text-xs text-mute">Queda como «ya pagado» sin cuenta: Finanzas la asigna después.</p>)}
        <Pie busy={busy} onClose={onClose} deshabilitado={invalido} texto="Registrar compra" textoBusy="Registrando…" />
      </form>
    </Popup>
  )
}

function HojaCosto({ hoja, busy, onClose, onConfirm }) {
  const linea = hoja?.linea
  const abierta = hoja?.tipo === 'costo'
  const [costo, setCosto] = useState('')
  useEffect(() => { if (abierta) setCosto(linea?.costoUnitarioPyg ? String(linea.costoUnitarioPyg) : '') }, [abierta, linea?.id, linea?.costoUnitarioPyg])
  const valor = Number(digitos(costo)) || 0
  return (
    <Popup open={abierta} onClose={onClose} title="Cargar costo" tamano="sm" testId="hoja-costo">
      <form onSubmit={(evento) => { evento.preventDefault(); if (valor > 0) onConfirm(linea, valor) }} className="space-y-3">
        <p className="text-sm text-mute"><b className="text-fore">{linea?.producto}</b> · compra {linea?.compra?.code}. El costo llega a la venta original.</p>
        <label className="block space-y-1 text-sm"><span className="font-semibold">Costo unitario (Gs.)</span>
          <MoneyInput aria-label="Costo unitario" value={costo} onValueChange={(v) => setCosto(v === '' ? '' : String(v))} placeholder="Ej. 640000" autoFocus /></label>
        <Pie busy={busy} onClose={onClose} deshabilitado={valor < 1} texto="Guardar costo" textoBusy="Guardando…" />
      </form>
    </Popup>
  )
}

function HojaPagar({ hoja, busy, finanzas, cuentas, onClose, onConfirm }) {
  const linea = hoja?.linea
  const abierta = hoja?.tipo === 'pagar'
  const [cuenta, setCuenta] = useState('')
  useEffect(() => { if (abierta) setCuenta('') }, [abierta, linea?.id])
  return (
    <Popup open={abierta} onClose={onClose} title="Marcar pagado" tamano="sm" testId="hoja-pagar">
      <form onSubmit={(evento) => { evento.preventDefault(); if (!finanzas || cuenta) onConfirm(linea, finanzas ? cuenta : '') }} className="space-y-3">
        <p className="text-sm text-mute"><b className="text-fore">{linea?.producto}</b> · compra {linea?.compra?.code}{linea?.compra?.costoPyg != null ? <> · <Money value={linea.compra.costoPyg} className="text-sm" /></> : ''}</p>
        {finanzas ? (
          <label className="block space-y-1 text-sm"><span className="font-semibold">¿De qué cuenta sale la plata?</span>
            <Select aria-label="Cuenta de origen" value={cuenta} onChange={(evento) => setCuenta(evento.target.value)}>
              <option value="">Elegí la cuenta…</option>
              {cuentas.map((fila) => <option key={fila.id} value={fila.id}>{fila.name}</option>)}
            </Select></label>
        ) : <p className="rounded-lg border border-ink-600 px-3 py-2 text-sm text-mute">Se marca como «ya pagado» sin cuenta. Finanzas la asigna después, sin duplicar la salida de caja.</p>}
        <Pie busy={busy} onClose={onClose} deshabilitado={finanzas && !cuenta} texto="Marcar pagado" textoBusy="Registrando…" />
      </form>
    </Popup>
  )
}

function HojaRecibir({ hoja, busy, onClose, onConfirm }) {
  const linea = hoja?.linea
  const abierta = hoja?.tipo === 'recibir'
  const [cantidad, setCantidad] = useState('1')
  useEffect(() => { if (abierta) setCantidad(String(Math.max(1, linea?.pendientes || 1))) }, [abierta, linea?.id, linea?.pendientes])
  const valor = Number(digitos(cantidad)) || 0
  return (
    <Popup open={abierta} onClose={onClose} title="Recibido" tamano="sm" testId="hoja-recibir">
      <form onSubmit={(evento) => { evento.preventDefault(); if (valor > 0) onConfirm(linea, valor) }} className="space-y-3">
        <p className="text-sm text-mute"><b className="text-fore">{linea?.producto}</b> · esperando {linea?.pendientes}. Producto sin serial: un toque y listo.</p>
        <label className="block space-y-1 text-sm"><span className="font-semibold">Unidades que llegaron</span>
          <Input inputMode="numeric" aria-label="Unidades que llegaron" value={cantidad} onChange={(evento) => setCantidad(digitos(evento.target.value).slice(0, 4))} autoFocus /></label>
        <Pie busy={busy} onClose={onClose} deshabilitado={valor < 1} texto="Confirmar llegada" textoBusy="Registrando…" />
      </form>
    </Popup>
  )
}
