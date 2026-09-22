import { useEffect, useMemo, useState } from 'react'
import { Aviso, BarraProgreso, Button, Modal, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { tableroPos, comparacion } from '@/lib/posAnalytics'
import { listVentas } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { construirDemoCajas, getDemoCash } from '@/lib/demoCash'
import { metodoDeMedio } from '@/lib/demoConciliacion'
import { fechaClave } from '@/utils/calculos'
import { fechaCorta } from '@/utils/fecha'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

// Tablero del POS (#156): ventas de hoy contra ayer, pedidos, unidades por
// pedido, ticket promedio, ventas netas, top productos, ventas por vendedor y
// sucursal, y cobros por medio. Se calcula en el navegador con los pedidos que
// ya trae la API (misma fuente que el listado).
const Cambio = ({ valor }) => {
  if (!valor) return <span className="text-[11px] text-mute">=</span>
  return (
    <span className={cn('text-[11px] font-semibold', valor > 0 ? 'text-ok' : 'text-bad')}>
      {valor > 0 ? '↑' : '↓'} {Math.abs(valor)}%
    </span>
  )
}

function Metrica({ label, valor, extra }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-600 bg-ink-800/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-mute">{label}</span>
        {extra}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums text-fore">{valor}</div>
    </div>
  )
}

function Lista({ titulo, filas, valorDe, etiquetaDe }) {
  if (!filas.length) return null
  const maximo = Math.max(1, ...filas.map(valorDe))
  return (
    <section className="rounded-xl border border-ink-600 p-3">
      <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-mute">{titulo}</h3>
      <div className="mt-2 space-y-1.5">
        {filas.map((fila) => (
          <div key={fila.clave}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-fore">{etiquetaDe(fila)}</span>
              <span className="shrink-0 tabular-nums text-mute">{gs(valorDe(fila))}</span>
            </div>
            <BarraProgreso className="mt-0.5" valor={valorDe(fila)} max={maximo} alto="sm" pista="bg-ink-700" etiqueta={`${etiquetaDe(fila)}: ${gs(valorDe(fila))}`} />
          </div>
        ))}
      </div>
    </section>
  )
}

// Períodos de los desgloses (top productos, vendedores, pagos). El encabezado
// siempre compara hoy contra ayer.
const PERIODOS = [['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Este mes']]
const desdeDePeriodo = (periodo) => {
  const hoy = new Date()
  if (periodo === 'hoy') return fechaClave(hoy)
  const desde = new Date(hoy)
  if (periodo === '7d') desde.setDate(desde.getDate() - 6)
  else desde.setDate(1)
  return fechaClave(desde)
}

export default function AnalyticsPos({ open, onClose }) {
  const [ordenes, setOrdenes] = useState(null)
  const [sesiones, setSesiones] = useState([])
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState('hoy')

  useEffect(() => {
    if (!open) return undefined
    let vivo = true
    setOrdenes(null)
    setError('')
    // Demo (#194): las métricas salen de las ventas ficticias del navegador,
    // nunca del API real.
    if (isDemoRuntime) {
      setOrdenes(listVentas().map(venta => ({
        id: venta.id,
        orderNumber: venta.id,
        totalPyg: Number(venta.precio || 0),
        createdAt: venta.creadoEn || (venta.fecha ? `${venta.fecha}T12:00:00` : new Date().toISOString()),
        status: venta.estadoPago === 'Pagado' ? 'COMPLETED' : 'PENDING',
        fulfillmentStatus: venta.entrega === 'Delivery' ? 'IN_TRANSIT' : 'PROCESSING',
        // #148 §18: cada pago conserva su medio y su cuenta como en la tienda.
        payments: (venta.pagos || []).map(pago => ({
          amountPyg: Number(pago.monto || 0),
          method: metodoDeMedio(pago.medioPago),
          accountSnapshot: pago.cuenta ? { name: pago.cuenta } : null,
          status: 'CONFIRMED',
          paidAt: pago.fecha,
        })),
        items: [{ quantity: 1, unitPricePyg: Number(venta.precio || 0), totalPyg: Number(venta.precio || 0) }],
        seller: { name: venta.vendedorNombre || 'Hernán Acosta' },
        branch: { name: 'Casa Central' },
      })))
      return () => { vivo = false }
    }
    api.get('/api/orders?filtro=todos&limit=500')
      .then((filas) => { if (vivo) setOrdenes(Array.isArray(filas) ? filas : []) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudieron cargar las ventas.') })
    return () => { vivo = false }
  }, [open])

  // Ventas por caja (#148 §18): el mismo corte por sesión de Finanzas → Caja.
  useEffect(() => {
    if (!open) return undefined
    let vivo = true
    const desde = desdeDePeriodo(periodo)
    const hasta = fechaClave()
    if (isDemoRuntime) {
      const enRango = (valor) => { const dia = String(valor || '').slice(0, 10); return dia >= desde && dia <= hasta }
      setSesiones(construirDemoCajas({ cash: getDemoCash(), ventas: listVentas() }).filter((sesion) => enRango(sesion.openedAt)))
      return () => { vivo = false }
    }
    api.get(`/api/cash?sesiones=1&from=${desde}&to=${hasta}`)
      .then((data) => { if (vivo) setSesiones(Array.isArray(data?.sesiones) ? data.sesiones : []) })
      .catch(() => { if (vivo) setSesiones([]) })
    return () => { vivo = false }
  }, [open, periodo])

  const tablero = useMemo(
    () => (ordenes ? tableroPos(ordenes, { desde: desdeDePeriodo(periodo) }) : null),
    [ordenes, periodo],
  )
  const cambioVentas = tablero ? comparacion(tablero.hoy.ventas, tablero.ayer.ventas) : 0

  return (
    <Modal open={open} onClose={onClose} title="Analytics del POS" size="amplio">
      {error && <Aviso tono="error" className="rounded-xl">{error}</Aviso>}
      {!tablero && !error && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>}
      {tablero && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-mute">Resumen de hoy</h3>
            <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="tablist" aria-label="Período del análisis">
              {PERIODOS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={periodo === id}
                  onClick={() => setPeriodo(id)}
                  className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', periodo === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metrica label="Ventas de hoy" valor={gs(tablero.hoy.ventas)} extra={<Cambio valor={cambioVentas} />} />
            <Metrica label="Pedidos" valor={tablero.hoy.pedidos} extra={<span className="text-[11px] text-mute">ayer {tablero.ayer.pedidos}</span>} />
            <Metrica label="Ticket promedio" valor={gs(tablero.hoy.aov)} />
            <Metrica label="Items por pedido" valor={tablero.hoy.itemsPorPedido} />
            <Metrica label="Ventas netas" valor={gs(tablero.hoy.neto)} extra={<span className="text-[11px] text-mute">bruto {gs(tablero.hoy.bruto)}</span>} />
            <Metrica label="Descuentos" valor={gs(tablero.hoy.descuentos)} />
            <Metrica label="Cobrado" valor={gs(tablero.hoy.cobrado)} />
            <Metrica label="Efectivo" valor={gs(tablero.hoy.efectivo)} extra={tablero.hoy.reembolsado ? <span className="text-[11px] text-mute">reembolsos {gs(tablero.hoy.reembolsado)}</span> : null} />
            <Metrica label="Pendiente" valor={gs(tablero.hoy.pendiente)} />
            <Metrica label="Reembolsos" valor={gs(tablero.hoy.reembolsado)} />
          </div>

          <div className={GRILLA_DOS_COLUMNAS}>
            <Lista titulo="Top productos" filas={tablero.topProductos} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => `${fila.nombre} · ${fila.unidades} u.`} />
            <Lista titulo="Ventas por vendedor" filas={tablero.porVendedor} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pedidos} ped.`} />
            <Lista titulo="Ventas por sucursal" filas={tablero.porSucursal} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => fila.etiqueta} />
            <Lista
              titulo={`Cobros netos por tipo · ${periodo === 'hoy' ? 'hoy' : periodo === '7d' ? '7 días' : 'mes'}`}
              filas={tablero.pagos}
              valorDe={(fila) => fila.neto}
              etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pagos} pago(s)${fila.reembolsado ? ` · reembolsado ${gs(fila.reembolsado)}` : ''}`}
            />
            <Lista titulo="Cobros netos por cuenta" filas={tablero.pagosPorCuenta} valorDe={(fila) => fila.neto} etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pagos} pago(s)`} />
            <Lista titulo="Cobros netos por sucursal" filas={tablero.pagosPorSucursal} valorDe={(fila) => fila.neto} etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pagos} pago(s)`} />
            {sesiones.length > 0 && (
              <Lista titulo="Ventas por caja" filas={sesiones} valorDe={(fila) => fila.ventasPyg} etiquetaDe={(fila) => `${fila.openedByName} · ${fechaCorta(fila.openedAt)} · ${fila.pedidos} ped. · efectivo ${gs(fila.efectivoPyg)}`} />
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
