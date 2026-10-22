// Datos de prueba para la verificación de pagos: política «verificar» solo para
// una cuenta propia de la spec (así no cambia el cobro de ninguna otra spec que
// corra al mismo tiempo), pedidos cobrados por el vendedor y comprobantes.
import { execFileSync } from 'node:child_process'
import { request } from '@playwright/test'
import { SEED } from './seed-data.js'
import { contextoVendedorApi } from './seller-api.js'

// PNG de 1×1 píxel: el servidor valida el tipo por los bytes mágicos.
export const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export function psql(sql) {
  const puerto = process.env.MOBOS_E2E_PGPORT || '5439'
  const base = process.env.MOBOS_E2E_DB || 'mobos_e2e'
  return execFileSync('/opt/homebrew/bin/psql', ['-h', '127.0.0.1', '-p', puerto, '-U', 'postgres', '-d', base, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-c', sql]).toString().trim()
}

const EMPRESA = SEED.company.email

/** Guarda la política original de la empresa y activa «verificar» solo para estas cuentas. */
export function activarVerificacion(cuentaIds, { selfApproveRoles = [] } = {}) {
  const original = psql(`SELECT COALESCE("settings"->'paymentVerification', 'null'::jsonb)::text FROM "Tenant" WHERE "email" = '${EMPRESA}'`)
  const cuentas = Object.fromEntries(cuentaIds.map((id) => [id, 'verificar']))
  const politica = { methods: { CASH: 'auto', CARD: 'auto', PIX: 'auto', CRYPTO: 'auto', TRANSFER: 'auto' }, accounts: cuentas, requireProof: true, blockDelivery: true, selfApproveRoles }
  psql(`UPDATE "Tenant" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{paymentVerification}', '${JSON.stringify(politica)}'::jsonb, true) WHERE "email" = '${EMPRESA}'`)
  return original
}

export function restaurarVerificacion(original) {
  if (original === undefined) return
  psql(`UPDATE "Tenant" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{paymentVerification}', '${original === 'null' ? '{}' : original}'::jsonb, true) WHERE "email" = '${EMPRESA}'`)
}

/** fetch del navegador con la sesión del administrador (la página ya cargada). */
export function apiAdmin(page) {
  return (ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
    return { status: respuesta.status, datos: await respuesta.json().catch(() => null) }
  }, { api: SEED.api, ruta, opciones })
}

export async function crearCuentaYProducto(page, { kind, sufijo, precio = 10000 }) {
  const api = apiAdmin(page)
  const cuenta = await api('/api/payment-accounts', { method: 'POST', body: JSON.stringify({ name: `QA Verificación ${kind} ${sufijo}`, kind, currency: kind === 'PIX' ? 'BRL' : 'PYG', ...(kind === 'TRANSFER' ? { bank: 'Banco QA', holder: 'Titular QA', accountNumber: `QA-${sufijo}` } : { holder: 'Titular QA' }) }) })
  if (cuenta.status !== 201) throw new Error(`cuenta: ${cuenta.status} ${JSON.stringify(cuenta.datos)}`)
  const producto = await api('/api/products', { method: 'POST', body: JSON.stringify({ name: `QA Verificación ${sufijo}`, sku: `QA-VER-${sufijo}`, pricePyg: precio, stock: 50, branchId: SEED.branchId }) })
  if (producto.status !== 201) throw new Error(`producto: ${producto.status} ${JSON.stringify(producto.datos)}`)
  return { cuenta: cuenta.datos, producto: producto.datos }
}

// PIX cobra en reales: el monto en guaraníes sale de reales × cotización (montos múltiplos de 1.500).
export const COTIZACION_BRL = 1500
export function pagoDe(cuenta, monto, referencia) {
  const reales = cuenta.currency === 'BRL'
  return { accountId: cuenta.id, originalAmount: String(reales ? monto / COTIZACION_BRL : monto), exchangeRatePyg: reales ? String(COTIZACION_BRL) : '1', amountPyg: monto, method: cuenta.kind, status: 'CONFIRMED', reference: referencia }
}

/** Pedido cobrado por el vendedor con un pago en la cuenta de verificación. */
export async function pedidoDelVendedor(vendedor, { producto, cuenta, monto, referencia, cliente }) {
  const respuesta = await vendedor.post('/api/orders', {
    data: {
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto }],
      payments: [pagoDe(cuenta, monto, referencia)],
      ...(cliente ? { customerName: cliente } : {}),
    },
  })
  if (respuesta.status() !== 201) throw new Error(`pedido: ${respuesta.status()} ${await respuesta.text()}`)
  const pedido = await respuesta.json()
  return { pedido, pago: pedido.payments[0] }
}

export async function subirComprobante(vendedor, pagoId) {
  const respuesta = await vendedor.post(`/api/payments/${pagoId}/proofs`, { multipart: { file: { name: 'comprobante.png', mimeType: 'image/png', buffer: PNG_1X1 } } })
  if (respuesta.status() !== 201) throw new Error(`comprobante: ${respuesta.status()} ${await respuesta.text()}`)
}

/**
 * Sesión API del vendedor sembrado (con el origen de la app, como lo hace el navegador). Si el
 * marcador `.seeded` no está (el arnés lo deja sin escribir cuando restaura el snapshot de la base),
 * el vendedor se busca entre los usuarios que devuelve el login de la empresa.
 */
export async function vendedorApi() {
  const origen = `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}`
  try {
    return await contextoVendedorApi({ origen })
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause
  }
  const ctx = await request.newContext({ baseURL: SEED.api, extraHTTPHeaders: { Origin: origen } })
  const login = await ctx.post('/api/auth/login', { data: { email: SEED.company.email, password: SEED.company.password, deviceId: `e2e-vendedor-api-${Date.now().toString(36)}` } })
  if (!login.ok()) throw new Error(`login de empresa: HTTP ${login.status()} ${await login.text()}`)
  const vendedor = ((await login.json()).sellers || []).find((s) => s.name === SEED.sellers[0].name)
  if (!vendedor) throw new Error('El vendedor sembrado no está en la empresa.')
  const pin = await ctx.post('/api/auth/pin', { data: { sellerId: vendedor.id, pin: SEED.sellers[0].pin } })
  if (!pin.ok()) throw new Error(`PIN del vendedor: HTTP ${pin.status()} ${await pin.text()}`)
  return ctx
}
