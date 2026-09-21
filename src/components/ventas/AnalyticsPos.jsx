import { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { tableroPos, comparacion } from '@/lib/posAnalytics'
import { cn } from '@/lib/utils'

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
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-fono/70" style={{ width: `${Math.round((valorDe(fila) / maximo) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AnalyticsPos({ open, onClose }) {
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    let vivo = true
    setOrdenes(null)
    setError('')
    api.get('/api/orders?filtro=todos&limit=500')
      .then((filas) => { if (vivo) setOrdenes(Array.isArray(filas) ? filas : []) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudieron cargar las ventas.') })
    return () => { vivo = false }
  }, [open])

  const tablero = useMemo(() => (ordenes ? tableroPos(ordenes) : null), [ordenes])
  const cambioVentas = tablero ? comparacion(tablero.hoy.ventas, tablero.ayer.ventas) : 0

  return (
    <Modal open={open} onClose={onClose} title="Analytics del POS" className="max-w-3xl">
      {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {!tablero && !error && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>}
      {tablero && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metrica label="Ventas de hoy" valor={gs(tablero.hoy.ventas)} extra={<Cambio valor={cambioVentas} />} />
            <Metrica label="Pedidos" valor={tablero.hoy.pedidos} extra={<span className="text-[11px] text-mute">ayer {tablero.ayer.pedidos}</span>} />
            <Metrica label="Ticket promedio" valor={gs(tablero.hoy.aov)} />
            <Metrica label="Items por pedido" valor={tablero.hoy.itemsPorPedido} />
            <Metrica label="Ventas netas" valor={gs(tablero.hoy.neto)} extra={<span className="text-[11px] text-mute">bruto {gs(tablero.hoy.bruto)}</span>} />
            <Metrica label="Descuentos" valor={gs(tablero.hoy.descuentos)} />
            <Metrica label="Cobrado" valor={gs(tablero.hoy.cobrado)} />
            <Metrica label="Pendiente" valor={gs(tablero.hoy.pendiente)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Lista titulo="Top productos" filas={tablero.topProductos} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => `${fila.nombre} · ${fila.unidades} u.`} />
            <Lista titulo="Ventas por vendedor" filas={tablero.porVendedor} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pedidos} ped.`} />
            <Lista titulo="Ventas por sucursal" filas={tablero.porSucursal} valorDe={(fila) => fila.ventas} etiquetaDe={(fila) => fila.etiqueta} />
            <Lista titulo="Cobros por medio" filas={tablero.pagos} valorDe={(fila) => fila.monto} etiquetaDe={(fila) => `${fila.etiqueta} · ${fila.pagos} pago(s)`} />
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
