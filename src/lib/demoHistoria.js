// Fuentes vivas de la historia de la demo: une las ventas y compras de esta
// pestaña (incluidas las que la persona cargue) con los armadores puros de
// `lib/demo/historia*.js`. Solo se usa en modo demo; nunca llama al API.
import { listVentas } from '@/lib/storage'
import { loadDemoPurchases } from '@/lib/demoPurchases'
import { gastosDemo, adsDemo } from '@/lib/demo/finanzas'
import { construirLibrosDemo, historialCajaDemo } from '@/lib/demo/historiaCuentas'
import { lotesDeCompraDemo } from '@/lib/demo/historiaStock'
import { ACCESORIOS_DEMO } from '@/lib/demo/catalogoPro'
import { demoInventorySeed } from '@/lib/demoInventory'

export const fuentesHistoriaDemo = (ahora = new Date()) => ({ ventas: listVentas(), compras: loadDemoPurchases(), ahora })

/** Libros de caja, bancos, tarjetas y billeteras con las ventas vivas de la pestaña. */
export function librosDemo(ahora = new Date()) {
  const ventas = listVentas()
  const compras = loadDemoPurchases()
  const productos = ACCESORIOS_DEMO.map(([id, name, , , , stock]) => ({ id, name, stock }))
  const lotes = lotesDeCompraDemo({ productos, unidades: demoInventorySeed().units, ventas, compras, ahora })
  return construirLibrosDemo({ ventas, gastos: gastosDemo(ahora), ads: adsDemo(ahora), compras: [...compras, ...lotes], ahora })
}

export const historialCajaDeSesion = (sesionId, { esHoy = false, ahora = new Date() } = {}) => historialCajaDemo(librosDemo(ahora), sesionId, { esHoy })
