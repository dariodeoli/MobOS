import { useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas } from '@/lib/storage'
import {
  ventasDelDia,
  totalesVendedor,
  cobradoDeVenta,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import FormularioVenta from './FormularioVenta'
import { ordenesDeVentas } from '@/utils/resumenVentasDia'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import Icon from '@/components/shared/Icon'
import { totalResumen } from '@/lib/posCart'

// Barra compacta para pantallas angostas: cuando el layout no tiene columna
// lateral, el total y el acceso al carrito quedan pegados bajo el encabezado
// para no perderlos al deslizar el formulario.
function BarraTotal({ carrito, totalCompra, unidadesCarrito }) {
  return (
    <div data-testid="carrito-barra" className="sticky top-20 z-10 lg:hidden">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-fono/40 bg-gradient-to-br from-fono-dark via-fono to-fono px-4 py-3 shadow-lg shadow-black/25">
        <div className="min-w-0">
          <div className="truncate text-[10.5px] font-semibold uppercase tracking-[.08em] text-onbrand/75">
            {carrito.items.length === 0
              ? 'Sin productos'
              : `${carrito.items.length} ${carrito.items.length === 1 ? 'producto' : 'productos'} · ${unidadesCarrito} ${unidadesCarrito === 1 ? 'unidad' : 'unidades'}`}
          </div>
          <div className="v2-numero text-xl font-semibold tracking-tight tabular-nums text-onbrand">
            {gs(totalCompra)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => carrito.irARevisar?.()}
          disabled={!carrito.puedeRevisar}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-onbrand/15 px-4 text-sm font-bold text-onbrand transition hover:bg-onbrand/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="cart" className="h-4 w-4" />
          Ver carrito
        </button>
      </div>
    </div>
  )
}

// Pantalla de carga de venta: una sola página con el flujo completo. Acá se
// calculan los datos del día (contexto del vendedor) y el formulario se lleva
// la venta: cliente, productos, carrito y cobro con el resumen fijo.
export default function VistaCargarVenta({ tradeInDraft, onTradeInConsumed }) {
  const { sesion } = useSesion()
  const angosta = usePantallaAngosta()
  const ventas = listVentas()
  const [carrito, setCarrito] = useState({
    items: [],
    quitar: null,
    irARevisar: null,
    puedeRevisar: false,
  })

  const resumenDia = useMemo(() => {
    const hoy = ventasDelDia(ventas, fechaClave())
    const total = hoy.reduce((a, v) => a + num(v.precio), 0)
    // La demo guarda una fila por unidad de la misma venta (`compraId`): las
    // ventas/pedidos del día se cuentan por orden, no por fila (#148 §7, #187).
    const ordenes = ordenesDeVentas(hoy)
    // Cobrado vs pendiente de hoy para el vendedor de la sesión (los pagos
    // confirmados son los que importan, no lo facturado).
    const delVendedor = ventasDelDia(ventas, fechaClave(), sesion?.vendedorId)
    const ordenesVendedor = ordenesDeVentas(delVendedor)
    const cobrado = delVendedor.reduce((sum, v) => sum + cobradoDeVenta(v), 0)
    const pagadas = ordenesVendedor.filter(v => v.estadoPago === 'Pagado').length
    const pendiente = Math.max(0, totalesVendedor(ventas, sesion?.vendedorId).hoy - cobrado)
    return {
      total,
      cant: ordenes.length,
      ticket: ordenes.length ? total / ordenes.length : 0,
      cobrado,
      pendiente,
      pagadas,
      pendientes: ordenesVendedor.length - pagadas,
    }
  }, [ventas, sesion?.vendedorId])

  // Cada línea llega con su subtotal ya calculado (precio unitario × cantidad).
  const totalCompra = totalResumen(carrito.items)
  const unidadesCarrito = carrito.items.reduce((a, it) => a + (it.quantity || 1), 0)

  return (
    <div className="flex flex-col gap-5">
      {angosta && (
        <BarraTotal carrito={carrito} totalCompra={totalCompra} unidadesCarrito={unidadesCarrito} />
      )}
      <FormularioVenta
        onCarrito={setCarrito}
        resumenDia={resumenDia}
        tradeInDraft={tradeInDraft}
        onTradeInConsumed={onTradeInConsumed}
      />
    </div>
  )
}
