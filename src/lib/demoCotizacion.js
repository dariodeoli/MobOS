// Cotización pública en modo demo (#240 → portal): el enlace de la cuenta se
// arma con los datos ficticios del navegador (seeds + clientes creados en la
// pestaña), sin tocar el API real. Mismo contrato que /api/quotes/public/:token.
import { SEED_DEMO_CLIENTES, clientesDemoGuardados } from './demoClientes.js'

const TIENDA = 'Aurora Móviles'
const SUCURSAL = { name: 'Casa Central', address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Capital', phone: '0981555123', instagram: null }

export function demoCotizacionPayload(token) {
  const buscado = String(token || '').trim()
  if (!buscado) return null
  for (const cliente of [...SEED_DEMO_CLIENTES, ...clientesDemoGuardados()]) {
    const cotizacion = (cliente.cotizaciones || []).find((row) => row.publicToken === buscado)
    if (!cotizacion) continue
    const items = Array.isArray(cotizacion.items) ? cotizacion.items : []
    const subtotal = Number(cotizacion.subtotalPyg ?? items.reduce((suma, item) => suma + Number(item.totalPyg || 0), 0))
    const discountPyg = Number(cotizacion.discountPyg || 0)
    // Misma derivación que el backend: una cotización abierta con la validez
    // cumplida se muestra vencida.
    const vencida = ['DRAFT', 'SENT'].includes(cotizacion.status) && cotizacion.validUntil && Date.parse(cotizacion.validUntil) <= Date.now()
    return {
      number: cotizacion.number,
      status: vencida ? 'EXPIRED' : cotizacion.status,
      createdAt: cotizacion.createdAt || null,
      updatedAt: cotizacion.updatedAt || cotizacion.createdAt || null,
      validUntil: cotizacion.validUntil || null,
      company: { name: TIENDA, logo: false },
      branch: SUCURSAL,
      customerName: cliente.name,
      customer: { name: cliente.name, document: cliente.document || null },
      seller: 'Equipo demo',
      items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPricePyg: item.unitPricePyg,
        totalPyg: item.totalPyg,
      })),
      subtotalPyg: subtotal,
      discountPyg,
      totalPyg: Number(cotizacion.totalPyg || subtotal - discountPyg),
      notes: cotizacion.notes || null,
      resolution: cotizacion.resolution || null,
      demo: true,
    }
  }
  return null
}
