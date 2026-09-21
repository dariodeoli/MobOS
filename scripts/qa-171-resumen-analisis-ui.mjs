// Verificación UI de la unificación Resumen/Análisis (#171, fase 2 de #145):
// con el mismo rango, Resumen, Reportes, Ganancias y Conciliación deben mostrar
// los números del servidor y coincidir entre pantallas.
//
// Uso:
//   QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-171-resumen-analisis-ui.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { gs, ticketPromedio } from '../src/utils/calculos.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = process.env.QA_API_URL || 'http://localhost:3115'
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = join(RAIZ, 'docs/qa/171')
mkdirSync(SALIDA, { recursive: true })

const TZ = -180
const resultados = []
let cookies = ''
let erroresConsola = []

async function api(path) {
  const respuesta = await fetch(`${API}${path}`, { headers: { origin: WEB, ...(cookies ? { cookie: cookies } : {}) } })
  const setCookie = respuesta.headers.getSetCookie?.() || []
  if (setCookie.length) cookies = setCookie.map((fila) => fila.split(';')[0]).join('; ')
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(`${path} → ${respuesta.status}: ${JSON.stringify(datos)}`)
  return datos
}

// ── Sesión y datos del servidor para el rango ───────────────────────────────
const loginRespuesta = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB },
  body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-171-ui' }),
})
const login = await loginRespuesta.json()
cookies = (loginRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = await fetch(`${API}/api/auth/pin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies },
  body: JSON.stringify({ sellerId: admin.id, pin: '1234' }),
})
cookies = `${cookies}; ${(pinRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')}`

const aFecha = (ms) => new Date(ms + TZ * 60000).toISOString().slice(0, 10)
const hoy = aFecha(Date.now())
const desde = `${hoy.slice(0, 7)}-01` // mes en curso: el período «mes» de Ganancias
const rango = `from=${desde}&to=${hoy}`
const dia = await api(`/api/reports?${rango}&tzOffset=${TZ}&groupBy=day`)
const productos = await api(`/api/reports?${rango}&tzOffset=${TZ}&groupBy=product`)
const conciliacion = await api(`/api/finance/reconciliation?${rango}&soloResumen=1`)
const t = dia.totals
const inv = productos.inventory
const top = productos.groups[0]
const conc = conciliacion.resumen
console.log(`Rango ${desde} → ${hoy} · ${t.orders} ventas · facturado ${gs(t.totalPyg)}`)

const ver = async (nombre, fn) => {
  try {
    await fn()
    resultados.push({ nombre, ok: true })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 200)}`)
  }
}
// El texto aparece dentro de la tarjeta cuyo título se indica.
const enTarjeta = async (page, titulo, texto) => {
  const tarjeta = page.locator('div').filter({ hasText: titulo }).filter({ hasText: texto }).last()
  await expect(tarjeta).toBeVisible()
}
const enPantalla = async (page, texto) => {
  await expect(page.getByText(texto, { exact: false }).filter({ visible: true }).first()).toBeVisible()
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
await ctx.addCookies(cookies.split('; ').map((par) => {
  const [name, ...resto] = par.split('=')
  return { name, value: resto.join('='), domain: 'localhost', path: '/' }
}))
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message}`))

// ── Resumen: portada ejecutiva con el servidor ──────────────────────────────
await ver('Resumen muestra facturado, cobrado y pendiente del servidor', async () => {
  await page.goto(`${WEB}/resumen?desde=${desde}&hasta=${hoy}`)
  await enPantalla(page, 'Facturado')
  await enPantalla(page, gs(t.totalPyg))
  await enPantalla(page, gs(t.collectedPyg))
  await enPantalla(page, gs(t.pendingPyg))
})
await ver('Resumen muestra ventas, ticket y unidades del período', async () => {
  await enTarjeta(page, 'Ventas', String(t.orders))
  await enTarjeta(page, 'Ticket promedio', gs(ticketPromedio(t.totalPyg, t.orders)))
  // «Comisiones» de la portada es la comisión de producto (capa local), distinta
  // de la comisión de cobro del servidor: acá solo se valida que esté visible.
  await expect(page.getByText('Comisiones').filter({ visible: true }).first()).toBeVisible()
})
await ver('Resumen muestra el top de productos con su clase ABC', async () => {
  await enTarjeta(page, 'Top productos', top.label)
  await enTarjeta(page, 'Top productos', gs(top.grossPyg))
  await enTarjeta(page, 'Top productos', top.abcClass)
})
await ver('Resumen muestra stock valorizado, días de stock y rotación', async () => {
  await enTarjeta(page, 'Stock valorizado', gs(inv.stockValuePyg))
  await enTarjeta(page, 'Stock valorizado', inv.daysOfStock === null ? '—' : `${inv.daysOfStock} días`)
  await enTarjeta(page, 'Stock valorizado', inv.sellThroughPct === null ? '—' : `${inv.sellThroughPct}%`)
  await enTarjeta(page, 'Stock valorizado', `${inv.stockWithoutCost}`)
})
await ver('Resumen muestra cobros por procesadora y por cuenta', async () => {
  const filas = (await api(`/api/reports?${rango}&tzOffset=${TZ}&groupBy=payments&paymentsBy=processor`)).groups
  const cuentas = (await api(`/api/reports?${rango}&tzOffset=${TZ}&groupBy=payments&paymentsBy=account`)).groups
  if (filas.length) {
    await enTarjeta(page, 'Cobros por procesadora', gs(filas[0].totalPyg))
    await enTarjeta(page, 'Cobros por procesadora', `${filas[0].units} pago(s)`)
  }
  if (cuentas.length) await enTarjeta(page, 'Cuentas con mayor ingreso', gs(cuentas[0].totalPyg))
})
await ver('Resumen muestra la conciliación del período', async () => {
  await enTarjeta(page, 'Conciliación', gs(conc.verifiedPyg))
  await enTarjeta(page, 'Conciliación', gs(conc.porConciliar))
  await enTarjeta(page, 'Conciliación', conc.differencePyg ? gs(conc.differencePyg) : '—')
  await enTarjeta(page, 'Conciliación', `${conc.lotes} lote(s)`)
})
await page.screenshot({ path: join(SALIDA, 'resumen.jpg'), type: 'jpeg', quality: 70 })

// ── Reportes: la vista extendida con el mismo backend ───────────────────────
await ver('Reportes muestra los mismos totales que Resumen', async () => {
  await page.goto(`${WEB}/analisis/reportes?desde=${desde}&hasta=${hoy}`)
  await enPantalla(page, 'Total del período')
  await enPantalla(page, gs(t.totalPyg))
  await enPantalla(page, gs(t.collectedPyg))
  await enPantalla(page, gs(t.costPyg))
  await enPantalla(page, gs(t.netProfitPyg ?? t.profitPyg))
  if (t.commissionPyg > 0) await enPantalla(page, `Comisiones de cobro ${gs(t.commissionPyg)}`)
})
await ver('Reportes muestra el mismo top de productos (curva ABC del servidor)', async () => {
  await enPantalla(page, top.label)
  await enPantalla(page, gs(top.grossPyg))
})
await ver('Reportes muestra el mismo stock valorizado', async () => {
  await enPantalla(page, gs(inv.stockValuePyg))
  await enPantalla(page, inv.daysOfStock === null ? '—' : `${inv.daysOfStock} días de stock`)
})
await page.screenshot({ path: join(SALIDA, 'reportes.jpg'), type: 'jpeg', quality: 70 })

// ── Ganancias vs Reportes: mismo resultado para el mismo período ────────────
await ver('Ganancias y Reportes muestran el mismo resultado del período', async () => {
  await page.goto(`${WEB}/analisis/ganancias?periodo=mes`)
  // Ganancias parte del cálculo local y se actualiza con el reporte del
  // servidor: se espera el total del servidor antes de leer el resultado.
  await enPantalla(page, gs(t.totalPyg))
  await page.waitForSelector('[data-testid="ganancia-resultado"]')
  const resultadoGanancias = (await page.locator('[data-testid="ganancia-resultado"]').textContent()).trim()
  await page.goto(`${WEB}/analisis/reportes?desde=${desde}&hasta=${hoy}`)
  await enPantalla(page, gs(t.totalPyg))
  await page.waitForSelector('[data-testid="reporte-resultado"]')
  const resultadoReportes = (await page.locator('[data-testid="reporte-resultado"]').textContent()).trim()
  expect(resultadoReportes).toBe(resultadoGanancias)
})
await page.screenshot({ path: join(SALIDA, 'ganancias.jpg'), type: 'jpeg', quality: 70 })

// ── Conciliación en Finanzas: mismo resumen que la portada ──────────────────
await ver('Finanzas → Conciliación repite el resumen de la portada', async () => {
  await page.goto(`${WEB}/finanzas/conciliacion?desde=${desde}&hasta=${hoy}`)
  await enTarjeta(page, 'Conciliación y trazabilidad', gs(conc.verifiedPyg))
  await enTarjeta(page, 'Conciliación y trazabilidad', gs(conc.porConciliar))
  await enTarjeta(page, 'Conciliación y trazabilidad', conc.differencePyg ? gs(conc.differencePyg) : '—')
})
await page.screenshot({ path: join(SALIDA, 'conciliacion.jpg'), type: 'jpeg', quality: 70 })

// Ruido conocido del entorno local (no del dominio): el shell avisa por un
// `className={false}` (AppShell.jsx:358, ajeno a #171), el avatar del admin no
// existe, el agente de impresión local no corre y React Router avisa de v7.
const RUIDO_CONOCIDO = /non-boolean attribute|Failed to load resource|ERR_CONNECTION_REFUSED|React Router Future Flag|pageerror: ResizeObserver/i
await ver('Ganadores muestra las cantidades por línea del servidor', async () => {
  await page.goto(`${WEB}/analisis/ganadores?periodo=mes`)
  await enTarjeta(page, 'Productos ganadores', top.label)
  await enTarjeta(page, top.label, `${top.units} unidades vendidas`)
})

await ver('La portada avisa cuando el reporte del servidor viene truncado', async () => {
  await page.route(/\/api\/reports\?.*groupBy=day/, async (ruta) => {
    const respuesta = await ruta.fetch()
    const cuerpo = await respuesta.json()
    cuerpo.truncated = true
    await ruta.fulfill({ response: respuesta, json: cuerpo })
  })
  await page.goto(`${WEB}/resumen?desde=${desde}&hasta=${hoy}`)
  await enPantalla(page, 'El período supera el tope de ventas analizadas')
  await page.unroute(/\/api\/reports\?.*groupBy=day/)
})

await ver('Sin errores de consola propios del recorrido', async () => {
  const propios = erroresConsola.filter((texto) => !RUIDO_CONOCIDO.test(texto))
  expect(propios).toEqual([])
})

const fallos = resultados.filter((fila) => !fila.ok)
writeFileSync(join(SALIDA, 'resultados-ui.json'), JSON.stringify({ desde, hasta: hoy, totales: t, erroresConsola, resultados }, null, 2))
await browser.close()
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones de UI OK`)
if (fallos.length) process.exitCode = 1
