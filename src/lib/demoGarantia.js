// Garantía pública en modo demo (#240 §3/§4): la credencial del QR se arma con
// los datos ficticios del navegador (seeds + clientes creados en la pestaña),
// sin tocar el API real. Mismo contrato que /api/public/warranty/:token.
import { SEED_DEMO_CLIENTES, clientesDemoGuardados } from './demoClientes.js'
import { pedidoDemoDelSerial } from './demoInforme.js'

const TIENDA = 'Aurora Móviles'
const CIUDAD = 'Asunción'
const TELEFONO_TIENDA = '0981555123'

export function demoGarantiaPayload(token) {
  const buscado = String(token || '').trim()
  if (!buscado) return null
  const clientes = [...SEED_DEMO_CLIENTES, ...clientesDemoGuardados()]
  for (const cliente of clientes) {
    const garantia = (cliente.demoProfile?.warranties || []).find((row) => row.publicToken === buscado)
    if (!garantia) continue
    const venta = pedidoDemoDelSerial(garantia.serial)
    const expiresAt = garantia.expiresAt || null
    return {
      customerName: cliente.name,
      serial: garantia.serial,
      productName: garantia.description || venta?.item?.description || 'Equipo',
      status: garantia.status,
      createdAt: garantia.createdAt || null,
      expiresAt,
      warrantyDays: garantia.warrantyDays ?? null,
      daysRemaining: expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)) : null,
      coverage: garantia.coverage || '',
      exclusions: garantia.exclusions || '',
      store: { name: TIENDA, phone: TELEFONO_TIENDA, city: CIUDAD },
      orderNumber: venta?.pedido?.orderNumber || null,
      purchasedAt: venta?.pedido?.createdAt || garantia.createdAt || null,
      demo: true,
    }
  }
  return null
}
