// Cotización pública en modo demo (#240 → portal, actualizada en #314): el
// enlace se arma con los fixtures del navegador y su estado de la pestaña, sin
// tocar el API real. Mismo contrato que /api/quotes/public/:token.
import { buscarDemoCotizacionPorToken } from './demoCotizaciones.js'
import { estadoCotizacion } from './cotizaciones.js'

const TIENDA = 'Aurora Móviles'
const SUCURSAL = { name: 'Casa Central', address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Capital', phone: '0981555123', instagram: null }

export function demoCotizacionPayload(token) {
  const cotizacion = buscarDemoCotizacionPorToken(token)
  // El borrador es interno de la tienda y nunca se expone al cliente.
  if (!cotizacion || cotizacion.status === 'DRAFT') return null
  const items = Array.isArray(cotizacion.items) ? cotizacion.items : []
  const subtotal = Number(cotizacion.subtotalPyg ?? items.reduce((suma, item) => suma + Number(item.totalPyg || 0), 0))
  const discountPyg = Number(cotizacion.discountPyg || 0)
  return {
    number: cotizacion.number,
    status: estadoCotizacion(cotizacion),
    createdAt: cotizacion.createdAt || null,
    updatedAt: cotizacion.updatedAt || cotizacion.createdAt || null,
    validUntil: cotizacion.validUntil || null,
    company: { name: TIENDA, logo: false },
    branch: SUCURSAL,
    customerName: cotizacion.customerName || 'Consumidor final',
    customer: { name: cotizacion.customerName || 'Consumidor final', document: cotizacion.customer?.document || null },
    seller: cotizacion.seller?.name || cotizacion.sellerName || 'Equipo demo',
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPricePyg: item.unitPricePyg,
      totalPyg: Number(item.totalPyg ?? Number(item.quantity) * Number(item.unitPricePyg)),
    })),
    subtotalPyg: subtotal,
    discountPyg,
    totalPyg: Number(cotizacion.totalPyg ?? subtotal - discountPyg),
    notes: cotizacion.notes || null,
    resolution: cotizacion.resolution || null,
    // A3 (#279): versión congelada y canales de OTP (demo simulada).
    version: cotizacion.version || { number: 1, hash: 'demo', frozenAt: cotizacion.updatedAt || cotizacion.createdAt || null },
    approval: cotizacion.approval || null,
    otp: { canales: { email: true, phone: false }, email: 'l***@c***.com', phone: null, maxAttempts: 5 },
    demo: true,
  }
}
