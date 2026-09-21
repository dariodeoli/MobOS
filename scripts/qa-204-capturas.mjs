// Evidencia de la caza de bugs FIN de la ronda 2 (#204): capturas y JSON con
// los tres hallazgos del dominio.
//
// Uso: QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//      QA_MODO=after node scripts/qa-204-capturas.mjs
// Salida: docs/qa/204/*.jpg + docs/qa/204/capturas-<modo>.json
//
// `QA_MODO=before` documenta el estado previo al fix (se corre con los archivos
// revertidos a propósito, ver docs/qa/204/README.md).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = process.env.QA_API_URL || 'http://localhost:3115'
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const MODO = process.env.QA_MODO === 'before' ? 'before' : 'after'
const SALIDA = join(RAIZ, 'docs/qa/204')
mkdirSync(SALIDA, { recursive: true })

const registro = { modo: MODO, capturadoEn: new Date().toISOString(), pasos: {} }
let cookies = ''
const dia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10)

async function api(path, { method = 'GET', body } = {}) {
  const respuesta = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: WEB, ...(cookies ? { cookie: cookies } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const setCookie = respuesta.headers.getSetCookie?.() || []
  if (setCookie.length) cookies = setCookie.map((c) => c.split(';')[0]).join('; ')
  return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
}

// Sesión de administración del entorno local (mismos datos que usa e2e).
const login = await api('/api/auth/login', { method: 'POST', body: { email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: `qa-204-${MODO}` } })
if (login.status !== 200) throw new Error(`login ${login.status}`)
const admin = (login.data.sellers || []).find((u) => u.name === 'Administrador')
if (!admin) throw new Error('no encontré al administrador')
const pin = await api('/api/auth/pin', { method: 'POST', body: { sellerId: admin.id, pin: '1234' } })
if (pin.status !== 200) throw new Error(`pin ${pin.status}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies(cookies.split('; ').map((par) => {
  const [name, ...resto] = par.split('=')
  return { name, value: resto.join('='), domain: 'localhost', path: '/' }
}))
const page = await ctx.newPage()
const captura = (nombre) => page.screenshot({ path: join(SALIDA, `204-${nombre}-${MODO}.jpg`), type: 'jpeg', quality: 72, fullPage: false })

// ── Hallazgo A: el seguro de la empresa no volvía en GET /api/account ───────
{
  const cuenta = await api('/api/account')
  const seguroApi = cuenta.data?.tenant?.insurancePct ?? null
  await page.goto(`${WEB}/configuracion/negocio`)
  await page.waitForSelector('#seguro-pct', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const valorCargado = await page.inputValue('#seguro-pct')
  await page.reload()
  await page.waitForSelector('#seguro-pct', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const valorTrasRecarga = await page.inputValue('#seguro-pct')
  await captura('a-config-seguro')
  registro.pasos.seguro = { insurancePctApi: seguroApi, valorCargado, valorTrasRecarga }
  console.log(`A seguro: api=${seguroApi} cargado="${valorCargado}" tras recarga="${valorTrasRecarga}"`)
}

// ── Hallazgo B: la transferencia ofrecía y aceptaba USDT ────────────────────
{
  const alta = await api('/api/payment-accounts', {
    method: 'POST',
    body: { name: `QA 204 captura ${MODO} ${Date.now().toString(36).toUpperCase()}`, kind: 'TRANSFER', currency: 'USDT', bank: 'Banco QA', holder: 'QA', accountNumber: 'QA-USDT' },
  })
  await page.goto(`${WEB}/finanzas/bancos`)
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.waitForSelector('#pa-kind', { timeout: 30000 })
  await page.selectOption('#pa-kind', 'TRANSFER')
  const monedas = await page.$$eval('#pa-currency option', (opciones) => opciones.map((o) => o.value))
  await captura('b-cuenta-transferencia')
  registro.pasos.transferenciaUsdt = { altaApi: alta.status, monedasOfrecidas: monedas }
  console.log(`B transferencia+USDT: api=${alta.status} · monedas=${monedas.join(',')}`)
}

// ── Hallazgo C: reasignar un pago ya conciliado dejaba lotes huérfanos ──────
{
  const vista = await api(`/api/finance/reconciliation?from=${dia()}&to=${dia()}`)
  const huerfanos = (vista.data?.lotes || []).filter((l) => l.pagos === 0 && l.differencePyg !== 0)
  const enLote = (vista.data?.items || []).find((item) => item.conciliacion?.batchId)
  let reintento = null
  if (enLote) {
    const intento = await api('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [enLote.id], receivedPyg: enLote.amountPyg, note: `Reasignación QA 204 (${MODO})` } })
    reintento = intento.status
  }
  await page.goto(`${WEB}/finanzas/conciliacion`)
  await page.waitForSelector('text=/Conciliación/', { timeout: 30000 })
  await captura('c-conciliacion')
  registro.pasos.reasignacion = {
    lotesHuerfanos: huerfanos.map((l) => ({ id: l.id, pagos: l.pagos, expectedPyg: l.expectedPyg, receivedPyg: l.receivedPyg, differencePyg: l.differencePyg })),
    pagoProbado: enLote?.id || null,
    reintentoStatus: reintento,
  }
  console.log(`C reasignación: huérfanos=${huerfanos.length} · reintento=${reintento}`)
}

writeFileSync(join(SALIDA, `capturas-${MODO}.json`), JSON.stringify(registro, null, 2))
await browser.close()
console.log(`OK · capturas en docs/qa/204 (modo ${MODO})`)
