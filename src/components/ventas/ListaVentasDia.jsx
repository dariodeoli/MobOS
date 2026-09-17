import { useState } from 'react'
import { listVentas, productosById, deleteVenta, refrescar } from '@/lib/storage'
import { useSesion } from '@/lib/sesion'
import { fechaClave, num, gs } from '@/utils/calculos'
import { fmtLargo } from '@/components/shared/RangoFechas'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { Card, Badge, Dot, EmptyState, Modal, Button, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api/client'
import PagosPedido from './PagosPedido'

// Agrupa por compra (compraId); las sueltas quedan como grupo de 1.
function agruparCompras(ventas) {
  const grupos = []
  const idx = new Map()
  ventas.forEach(v => {
    const key = v.compraId || v.id
    if (!idx.has(key)) {
      idx.set(key, grupos.length)
      grupos.push({ key, items: [v] })
    } else grupos[idx.get(key)].items.push(v)
  })
  return grupos
}

const FILTROS = [
  ['todas', 'Todas'],
  ['pagadas', 'Pagadas'],
  ['pendientes', 'Pendientes'],
  ['envios', 'Envíos'],
]

const POR_PAGINA = 12

// Normaliza para buscar sin importar acentos ni mayúsculas.
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ListaVentasDia({
  vendedorId,
  mostrarVendedor = false,
  vendedoresById = {},
  fecha = fechaClave(),
  rango = null,
  titulo = null,
  filtro: filtroControlado,
  onFiltroChange,
}) {
  const { sesion, esDemo } = useSesion()
  // En modo API las ventas viven en el backend y aún no hay endpoint de
  // eliminación; el borrado local solo aplica a la demo.
  const puedeBorrar = !!sesion?.esPropietario && esDemo
  const prods = productosById()
  const [filtroInterno, setFiltroInterno] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  // Optional controlled filter: when the parent passes `filtro`, it owns the
  // selected tab (e.g. the dashboard's "pending" shortcut); otherwise the
  // component keeps its own state as before.
  const filtro = filtroControlado ?? filtroInterno
  function cambiarFiltro(k) {
    setFiltroInterno(k)
    setPagina(1)
    onFiltroChange?.(k)
  }
  const [confirmar, setConfirmar] = useState(null)
  const [pagoPedido, setPagoPedido] = useState(null)
  const [attach, setAttach] = useState(null) // { id, items: [{id, description, serialsPending}] }
  const [attachInput, setAttachInput] = useState('')
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachError, setAttachError] = useState('')

  async function guardarImeis() {
    if (attachBusy || !attach) return
    const serials = attachInput.split(/[\n,;]+/).map(s => String(s).trim().toUpperCase().replace(/[\s-]+/g, '')).filter(Boolean)
    const item = attach?.items?.[0]
    if (!item || !serials.length) { setAttachError('Ingresá al menos un IMEI/serial.'); return }
    setAttachBusy(true); setAttachError('')
    try {
      await api.patch(`/api/orders/${encodeURIComponent(attach.id)}`, { action: 'attachSerials', itemId: item.id, serials })
      await refrescar()
      setAttach(null); setAttachInput('')
    } catch (cause) { setAttachError(cause?.message || 'No se pudo agregar el IMEI.') } finally { setAttachBusy(false) }
  }

  const base = listVentas().filter(v => {
    const okFecha = rango ? v.fecha >= rango.desde && v.fecha <= rango.hasta : v.fecha === fecha
    return okFecha && (vendedorId == null || v.vendedorId === vendedorId)
  })

  const nombreProd = v => v.productoNombre || prods[v.productoId]?.nombre || '—'
  const q = norm(busqueda.trim())

  const ventas = base.filter(v => {
    if (filtro === 'pagadas' && v.estadoPago !== 'Pagado') return false
    if (filtro === 'pendientes' && v.estadoPago === 'Pagado') return false
    if (filtro === 'envios' && v.entrega === 'Retiro en tienda') return false
    if (!q) return true
    return [
      v.cliente,
      nombreProd(v),
      vendedoresById[v.vendedorId],
      v.medioPago,
      v.observacion,
    ].some(c => norm(c).includes(q))
  })
  const total = ventas.reduce((a, v) => a + num(v.precio), 0)

  // Paginación sobre compras (no sobre filas), para no cortar una compra al medio.
  const todosGrupos = agruparCompras(ventas)
  const paginas = Math.max(1, Math.ceil(todosGrupos.length / POR_PAGINA))
  const pag = Math.min(pagina, paginas)
  const grupos = todosGrupos.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA)

  const esHoy = !rango && fecha === fechaClave()
  const encabezado = titulo || (esHoy ? 'Ventas de hoy' : `Ventas del ${fmtLargo(fecha)}`)

  const cuenta = k =>
    k === 'todas'
      ? base.length
      : base.filter(v =>
          k === 'pagadas'
            ? v.estadoPago === 'Pagado'
            : k === 'pendientes'
              ? v.estadoPago !== 'Pagado'
              : v.entrega === 'Delivery' || v.entrega === 'Encomienda',
        ).length

  return (
    <Card className="overflow-hidden p-0">
      {pagoPedido && <PagosPedido venta={pagoPedido} onClose={() => setPagoPedido(null)} />}
      <Modal open={attach !== null} onClose={() => !attachBusy && setAttach(null)} title="Agregar IMEI al pedido">
        <div className="space-y-3">
          <p className="text-sm text-mute">Completá los IMEI/seriales de los equipos vendidos sobre pedido. Al confirmar, cada unidad queda registrada como vendida en el stock.</p>
          {attach?.items?.map(item => (
            <div key={item.id} className="rounded-xl border border-ink-600 p-3">
              <p className="text-sm font-semibold">{item.description}</p>
              <p className="mt-1 text-xs text-mute">Faltan {item.serialsPending} IMEI/serial(es).</p>
            </div>
          ))}
          <label className="block text-xs text-mute">IMEI / seriales (uno por línea)<Textarea aria-label="IMEI a agregar" rows={3} value={attachInput} onChange={event => setAttachInput(event.target.value)} placeholder={'359614543668631\n359614543779123'} /></label>
          {attachError && <p role="alert" className="text-sm text-bad">{attachError}</p>}
          <Button type="button" disabled={attachBusy} onClick={guardarImeis}>{attachBusy ? 'Guardando…' : 'Agregar IMEI'}</Button>
        </div>
      </Modal>
      {/* ── Encabezado ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-600 px-5 py-4">
        <div>
          <h2 className="font-medium">{encabezado}</h2>
          {!esHoy && !titulo && <p className="mt-0.5 text-xs text-mute">{fmtLargo(fecha)}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-mute">{ventas.length} ventas</span>
          <span className="font-semibold">{gs(total)}</span>
        </div>
      </div>

      {/* ── Búsqueda + filtros ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-600 px-5 py-3">
        <div className="relative min-w-[13rem] flex-1">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
          />
          <input
            value={busqueda}
            onChange={e => {
              setBusqueda(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar por cliente, producto o vendedor…"
            className="h-9 w-full rounded-lg border border-ink-500 bg-paper pl-9 pr-8 text-sm text-fore outline-none transition focus:border-fono placeholder:text-mute/60"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute transition hover:text-fore"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => cambiarFiltro(k)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition',
                filtro === k ? 'bg-ink-600 font-medium text-fore' : 'text-mute hover:text-fore',
              )}
            >
              {label}
              <span className="ml-1.5 text-xs text-mute">{cuenta(k)}</span>
            </button>
          ))}
        </div>
      </div>

      {ventas.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={
            filtro === 'todas' ? 'No hay ventas en este período.' : 'Ninguna venta con este filtro.'
          }
          className="py-16"
        />
      ) : (
        <>
          {/* ── Tarjetas (móvil) ─────────────────────────────────── */}
          <div className="space-y-2 p-4 xl:hidden">
            {grupos.map(g => {
              const v = g.items[0]
              const varios = g.items.length > 1
              const tot = g.items.reduce((a, x) => a + num(x.precio), 0)
              const pagado = v.estadoPago === 'Pagado'
              return (
                <div key={g.key} className="rounded-2xl border border-ink-600 bg-ink-800/30 px-4 py-3 transition hover:border-fono/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Dot color={pagado ? 'green' : 'red'} />
                        <span className="truncate font-medium">{v.cliente || '—'}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 pl-4 text-sm text-mute">
                        {g.items.map(it => (
                          <div key={it.id} className="flex justify-between gap-3">
                            <span className="truncate">{nombreProd(it)}</span>
                            {varios && <span className="shrink-0">{gs(it.precio)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{gs(tot)}</div>
                      <span className={cn('text-xs', pagado ? 'text-ok' : 'text-bad')}>
                        {pagado
                          ? 'Pagado'
                          : g.items.some(item => num(item.totalPagado) > 0)
                            ? 'Parcial'
                            : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                  {(g.items.some(item => Number(item.serialsPending || 0) > 0) || g.items.some(item => item.costPending === true)) && <div className="mt-1.5 flex flex-wrap gap-1.5 pl-4">
                    {g.items.some(item => Number(item.serialsPending || 0) > 0) && <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[10px] font-semibold text-warn">sin IMEI (sobre pedido)</span>}
                    {g.items.some(item => item.costPending === true) && <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">costo pendiente</span>}
                  </div>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-4">
                    <button
                      className="rounded-lg border border-fono/30 px-3 py-2 text-xs text-fono-light"
                      onClick={() => setPagoPedido(v)}
                    >
                      Pagos y comprobantes
                    </button>
                    <MedioPago medio={v.medioPago} alto="h-4" />
                    {v.entrega !== 'Retiro en tienda' && (
                      <Badge color="blue">
                        {v.entrega === 'Delivery' ? 'Delivery' : 'Encomienda'} {gs(v.montoDelivery)}
                      </Badge>
                    )}
                    {mostrarVendedor && (
                      <span className="text-xs text-mute">
                        {vendedoresById[v.vendedorId] || '—'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Tabla (escritorio) ───────────────────────────────── */}
          <div className="hidden min-w-0 overflow-x-auto xl:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className={mostrarVendedor ? 'w-[11%]' : 'w-[13%]'} />
                <col className={mostrarVendedor ? 'w-[14%]' : 'w-[18%]'} />
                <col className={mostrarVendedor ? 'w-[10%]' : 'w-[11%]'} />
                <col className={mostrarVendedor ? 'w-[10%]' : 'w-[12%]'} />
                <col className={mostrarVendedor ? 'w-[9%]' : 'w-[10%]'} />
                <col className={mostrarVendedor ? 'w-[9%]' : 'w-[10%]'} />
                {mostrarVendedor && <col className="w-[10%]" />}
                <col className={mostrarVendedor ? 'w-[17%]' : 'w-[16%]'} />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs font-medium text-mute">
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Producto</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3 text-right">Precio</th>
                  <th className="px-3 py-3">Pago</th>
                  <th className="px-3 py-3">Entrega</th>
                  {mostrarVendedor && <th className="px-3 py-3">Vendedor</th>}
                  <th className="px-3 py-3">Nota</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {grupos.map(g =>
                  g.items.map((v, idx) => {
                    const varios = g.items.length > 1
                    const tot = g.items.reduce((a, x) => a + num(x.precio), 0)
                    const pagado = v.estadoPago === 'Pagado'
                    return (
                      <tr
                        key={v.id}
                        className={cn(
                          'border-b border-ink-600/60 transition hover:bg-ink-700',
                          varios && 'bg-ink-700/30',
                        )}
                      >
                        {idx === 0 && (
                          <td
                            rowSpan={g.items.length}
                            className="border-r border-ink-600/60 px-3 py-3 align-top"
                          >
                            <div className="font-medium">{v.cliente || '—'}</div>
                            {varios && (
                              <div className="mt-1 text-xs text-mute">
                                {g.items.length} productos · {gs(tot)}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="break-words px-3 py-3 text-mute">
                          {nombreProd(v)}
                          {(Array.isArray(v.items) ? v.items : []).map((item, i) => {
                            const serials = Array.isArray(item.serials) ? item.serials : []
                            const pending = Number(item.serialsPending || 0)
                            return (
                              <div key={i} className="mt-0.5 text-[11px] leading-relaxed">
                                {serials.length > 0 && (
                                  <span className="font-semibold text-fono-light">IMEI {serials.map(s => `••••${String(s).slice(-4)}`).join(', ')}</span>
                                )}
                                {pending > 0 && (
                                  <span className="ml-1 inline-flex items-center gap-1 rounded bg-warn/20 px-1.5 py-0.5 font-semibold text-warn">
                                    <Icon name="alert" className="h-3 w-3" /> {pending} sin IMEI (sobre pedido)
                                  </span>
                                )}
                                {item.costPending === true && (
                                  <span className="ml-1 inline-flex items-center gap-1 rounded bg-sky-400/15 px-1.5 py-0.5 font-semibold text-sky-300">
                                    <Icon name="alert" className="h-3 w-3" /> costo pendiente
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                              pagado
                                ? 'border-ok/25 bg-ok/15 text-ok'
                                : 'border-bad/25 bg-bad/15 text-bad',
                            )}
                          >
                            <Dot color={pagado ? 'green' : 'red'} />
                            {pagado ? 'Pagado' : num(v.totalPagado) > 0 ? 'Parcial' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{gs(v.precio)}</td>
                        {idx === 0 ? (
                          <>
                            <td rowSpan={g.items.length} className="px-3 py-3 align-top">
                              <MedioPago medio={v.medioPago} />
                            </td>
                            <td rowSpan={g.items.length} className="px-3 py-3 align-top text-mute">
                              {v.entrega === 'Retiro en tienda' ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon name="store" className="h-4 w-4" /> Tienda
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon
                                    name={v.entrega === 'Delivery' ? 'truck' : 'package'}
                                    className="h-4 w-4"
                                  />
                                  {gs(v.montoDelivery)}
                                </span>
                              )}
                            </td>
                            {mostrarVendedor && (
                              <td
                                rowSpan={g.items.length}
                                className="break-words px-3 py-3 align-top text-mute"
                              >
                                {vendedoresById[v.vendedorId] || '—'}
                              </td>
                            )}
                            <td
                              rowSpan={g.items.length}
                              className="truncate px-3 py-3 align-top text-xs italic text-mute"
                            >
                              {v.observacion || ''}
                              {v.billingName && <span className="mt-1 block not-italic font-semibold text-fono-light">Factura a: {v.billingName}{v.billingDocument ? ` · ${v.billingDocument}` : ''}</span>}
                              {v.notes && <span className="mt-1 block not-italic">{v.notes}</span>}
                            </td>
                          </>
                        ) : null}
                        <td className="px-3 py-3 text-right">
                          <button
                            className="mb-2 w-full rounded-lg border border-fono/30 px-2 py-2 text-xs leading-tight text-fono-light"
                            onClick={() => setPagoPedido(v)}
                          >
                            Pagos
                          </button>
                          {(Array.isArray(v.items) ? v.items : []).some(item => Number(item.serialsPending || 0) > 0) && (
                            <button
                              className="mb-2 w-full rounded-lg border border-warn/40 px-2 py-2 text-xs leading-tight text-warn"
                              onClick={() => { setAttach({ id: v.id, items: v.items.filter(item => Number(item.serialsPending || 0) > 0) }); setAttachInput(''); setAttachError('') }}
                            >
                              Agregar IMEI
                            </button>
                          )}
                          {puedeBorrar ? (
                            <button
                              onClick={() => setConfirmar(v)}
                              className="rounded p-1.5 text-mute transition hover:bg-bad/15 hover:text-bad"
                              title="Eliminar"
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          ) : (
                            <Icon name="lock" className="h-4 w-4 text-ink-500" />
                          )}
                        </td>
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
          </div>

          {/* ── Paginación ─────────────────────────────────────────── */}
          {paginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-600 px-5 py-3">
              <button
                onClick={() => setPagina(pag - 1)}
                disabled={pag <= 1}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-sm transition hover:border-fono disabled:opacity-30 disabled:hover:border-ink-500"
              >
                <Icon name="back" className="h-4 w-4" />
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: paginas }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === paginas || Math.abs(n - pag) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-1">
                      {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-mute">…</span>}
                      <button
                        onClick={() => setPagina(n)}
                        className={cn(
                          'h-8 min-w-8 rounded-lg px-2 text-sm transition',
                          n === pag
                            ? 'bg-fono/20 font-medium text-fore ring-1 ring-fono/40'
                            : 'text-mute hover:bg-ink-700 hover:text-fore',
                        )}
                      >
                        {n}
                      </button>
                    </span>
                  ))}
              </div>

              <button
                onClick={() => setPagina(pag + 1)}
                disabled={pag >= paginas}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-sm transition hover:border-fono disabled:opacity-30 disabled:hover:border-ink-500"
              >
                Siguiente
                <Icon name="back" className="h-4 w-4 rotate-180" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Confirmación de borrado ──────────────────────────────── */}
      {confirmar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setConfirmar(null)}
        >
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">Eliminar venta</h3>
            <p className="mb-5 text-sm text-mute">
              {confirmar.cliente || 'Sin cliente'} · {nombreProd(confirmar)} ·{' '}
              {gs(confirmar.precio)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmar(null)}
                className="h-9 flex-1 rounded-lg border border-ink-500 text-sm transition hover:border-fono"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteVenta(confirmar.id)
                  setConfirmar(null)
                }}
                className="h-9 flex-1 rounded-lg bg-bad text-sm font-semibold text-fore transition hover:brightness-110"
              >
                Eliminar
              </button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}
