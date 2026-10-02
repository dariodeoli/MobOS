import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas, refrescarCatalogo } from '@/lib/storage'
import {
  ventasDelDia,
  totalesVendedor,
  cobradoDeVenta,
  fechaClave,
  num,
} from '@/utils/calculos'
import FormularioVenta from './FormularioVenta'
import { ordenesDeVentas } from '@/utils/resumenVentasDia'
import { useAlmacenRevision } from '@/hooks/useAlmacenRevision'

// Pantalla de carga de venta: una sola página con el flujo completo. Acá se
// calculan los datos del día (contexto del vendedor) y el formulario se lleva
// la venta: cliente, productos, carrito y cobro con el resumen fijo.
export default function VistaCargarVenta({ tradeInDraft, onTradeInConsumed, activo = true }) {
  const { sesion } = useSesion()
  // #257: repinta cuando el espejo local se actualiza (hidratación en segundo
  // plano o mutaciones) y refresca el catálogo al volver a la venta, así lo
  // cargado en Inventario u otra pestaña aparece sin recargar la app.
  useAlmacenRevision()
  useEffect(() => {
    if (activo) refrescarCatalogo().catch(() => { /* sin conexión: queda el espejo */ })
  }, [activo])
  const ventas = listVentas()
  // El carrito se reporta al shell por `onCarrito` (accesos rápidos); el total
  // y la acción principal viven en la barra fija del cobro (#309).
  const [, setCarrito] = useState({
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

  // #309: el total y la acción principal del celular viven en la barra fija
  // del bloque de cobro (PasoCobro); ya no hay barra superior duplicada.
  return (
    <div className="flex flex-col gap-5">
      <FormularioVenta
        onCarrito={setCarrito}
        resumenDia={resumenDia}
        tradeInDraft={tradeInDraft}
        onTradeInConsumed={onTradeInConsumed}
      />
    </div>
  )
}
