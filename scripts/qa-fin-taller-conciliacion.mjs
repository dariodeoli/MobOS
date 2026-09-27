// Verificación de conciliación de la deuda de repuestos del taller (#250 · FIN):
// la deuda que ve el taller (`/api/workshop/parts?porPagar=1`) tiene que ser la
// misma que suma Finanzas (`/api/finance.workshopParts`), el KPI de Caja tiene
// que incluirla, y el pago desde Finanzas tiene que bajarla en ambos lados con
// su egreso. Corre contra cualquier entorno con sesión.
//
// Uso:
//   QA_MODO=dev QA_BASE_URL=http://localhost:5215 QA_API_URL=http://localhost:3115 \
//   QA_STORAGE_STATE=e2e/.auth/admin.json node scripts/qa-fin-taller-conciliacion.mjs
//   (producción: igual sin QA_MODO, cuando el deploy traiga el bloque)
// Salida: docs/qa/fin-repuestos-taller/conciliacion-<modo>/resultados.json
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API = (process.env.QA_API_URL || WEB.replace('app.', 'api.')).replace(/\/$/, '')
const SESION = process.env.QA_STORAGE_STATE || ''
const MODO = process.env.QA_MODO === 'dev' ? 'dev' : 'produccion'
if (!SESION || !existsSync(SESION)) {
  console.error('Falta QA_STORAGE_STATE (sesión del entorno). Ver el encabezado del script.')
  process.exit(1)
}
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/fin-repuestos-taller', `conciliacion-${MODO}`)
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion', storageState: SESION })
const page = await ctx.newPage()

const traer = (ruta) => page.evaluate(async ({ api, ruta }) => {
  const response = await fetch(`${api}${ruta}`, { credentials: 'include' })
  return { status: response.status, body: await response.json().catch(() => null) }
}, { api: API, ruta })

const vencimientoDe = (dueAt) => {
  if (!dueAt) return 'SIN_VENCIMIENTO'
  const dias = Math.floor((new Date(dueAt).getTime() - Date.now()) / 86400000)
  return dias < 0 ? 'VENCIDA' : dias <= 7 ? 'POR_VENCER' : 'AL_DIA'
}
const montoDe = async (testId) => {
  const texto = await page.getByTestId(testId).textContent({ timeout: 4000 }).catch(() => '')
  return Number(String(texto || '').replace(/[^\d]/g, '') || 0)
}

let taller = null
let finanzas = null

await ver('Sesión válida sobre el entorno', async () => {
  await page.goto(`${WEB}/login`)
  const yo = await traer('/api/auth/me')
  expect(yo.status, 'la sesión no es válida').toBe(200)
  return yo.body?.user?.name || yo.body?.name || 'sesión activa'
})

await ver('Deuda del taller: workshop y Finanzas coinciden (sin filtro)', async () => {
  const tallerRes = await traer('/api/workshop/parts?porPagar=1')
  const finRes = await traer('/api/finance')
  expect(tallerRes.status, 'workshop/parts').toBe(200)
  expect(finRes.status, 'finance').toBe(200)
  taller = tallerRes.body
  finanzas = finRes.body
  expect(Number(finanzas.workshopParts?.totalPyg ?? -1), 'finance.workshopParts.totalPyg').toBe(Number(taller.resumen.porPagarPyg))
  expect(Number(finanzas.workshopParts?.vencidasPyg ?? -1), 'finance.workshopParts.vencidasPyg').toBe(Number(taller.resumen.vencidasPyg))
  const porId = new Map((finanzas.workshopParts?.rows || []).map((fila) => [fila.id, fila]))
  for (const parte of taller.parts.filter((fila) => Number(fila.deudaPyg) > 0)) {
    const fila = porId.get(parte.id)
    if (!fila) throw new Error(`la deuda de ${parte.code} no está en Finanzas`)
    expect(Number(fila.deudaPyg), `deuda de ${parte.code}`).toBe(Number(parte.deudaPyg))
    expect(fila.vencimiento, `vencimiento de ${parte.code}`).toBe(vencimientoDe(parte.dueAt))
  }
  for (const fila of finanzas.workshopParts?.rows || []) {
    if (!taller.parts.some((parte) => parte.id === fila.id)) throw new Error(`Finanzas muestra ${fila.code} que el taller no debe`)
  }
  return `${taller.parts.filter((fila) => Number(fila.deudaPyg) > 0).length} repuestos · ${taller.resumen.porPagarPyg} Gs (${taller.resumen.vencidasPyg} vencidos)`
})

await ver('Deuda del taller: coincide por sucursal', async () => {
  const ramas = await traer('/api/inventory-branches')
  const lista = Array.isArray(ramas.body) ? ramas.body : ramas.body?.branches || []
  let comparadas = 0
  for (const rama of lista.slice(0, 8)) {
    const id = rama.id || rama.branchId
    if (!id) continue
    const tallerRes = await traer(`/api/workshop/parts?porPagar=1&branchId=${encodeURIComponent(id)}`)
    const finRes = await traer(`/api/finance?branchId=${encodeURIComponent(id)}`)
    expect(Number(finRes.body?.workshopParts?.totalPyg ?? -1), `taller por sucursal ${rama.name || id}`).toBe(Number(tallerRes.body?.resumen?.porPagarPyg))
    expect(Number(finRes.body?.workshopParts?.vencidasPyg ?? -1), `vencidas por sucursal ${rama.name || id}`).toBe(Number(tallerRes.body?.resumen?.vencidasPyg))
    comparadas += 1
  }
  return `${comparadas} sucursal(es) comparadas`
})

await ver('El KPI de Caja incluye la deuda del taller', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 25_000 })
  const kpi = await montoDe('caja-por-pagar')
  const ramas = await traer('/api/inventory-branches')
  const lista = Array.isArray(ramas.body) ? ramas.body : ramas.body?.branches || []
  // El KPI se muestra con la sucursal seleccionada: alguna de las sucursales
  // tiene que dar exactamente compras + repuestos + taller.
  const esperados = [{
    rama: 'sin filtro',
    total: Number(finanzas.payables?.totalPyg || 0) + Number(finanzas.supplierPayables?.totalPyg || 0) + Number(finanzas.workshopParts?.totalPyg || 0),
  }]
  for (const rama of lista.slice(0, 8)) {
    const id = rama.id || rama.branchId
    if (!id) continue
    const fin = await traer(`/api/finance?branchId=${encodeURIComponent(id)}`)
    esperados.push({
      rama: rama.name || id,
      total: Number(fin.body?.payables?.totalPyg || 0) + Number(fin.body?.supplierPayables?.totalPyg || 0) + Number(fin.body?.workshopParts?.totalPyg || 0),
    })
  }
  const coincide = esperados.find((fila) => fila.total === kpi)
  expect(coincide, `el KPI ${kpi} no coincide con ninguna sucursal (${esperados.map((fila) => `${fila.rama}: ${fila.total}`).join(' · ')})`).toBeTruthy()
  return `KPI ${kpi} Gs = ${coincide.rama} (incluye taller)`
})

if (MODO === 'dev') {
  await ver('Pago desde Finanzas: la deuda baja en ambos lados con egreso y auditoría', async () => {
    // Repuesto a crédito y vencido, único de esta corrida.
    const nombre = `Conciliación taller ${Date.now().toString(36)}`
    const vencido = new Date(Date.now() - 4 * 86400000).toISOString()
    const ramas = await traer('/api/inventory-branches')
    const lista = Array.isArray(ramas.body) ? ramas.body : ramas.body?.branches || []
    const ramaId = lista[0]?.id || lista[0]?.branchId
    const creado = await page.evaluate(async ({ api, body }) => {
      const response = await fetch(`${api}/api/workshop/parts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, body: await response.json().catch(() => null) }
    }, { api: API, body: { name: nombre, ownership: 'PROPIO', paymentMode: 'CREDITO', quantity: 2, unitCostPyg: 175000, dueAt: vencido, branchId: ramaId } })
    expect([200, 201], `POST workshop/parts: ${JSON.stringify(creado.body)}`).toContain(creado.status)

    const antesTaller = await traer('/api/workshop/parts?porPagar=1')
    const antesFin = await traer('/api/finance')
    expect(Number(antesFin.body.workshopParts.totalPyg) - Number(finanzas.workshopParts.totalPyg)).toBe(350000)

    // Evidencia con la deuda nueva en el bloque antes de pagar.
    await page.goto(`${WEB}/finanzas/caja`)
    await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByTestId('taller-repuestos')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('taller-repuestos').screenshot({ path: join(SALIDA, 'caja-deuda-taller.png') })

    const cuentas = await traer('/api/payment-accounts')
    const cuenta = (Array.isArray(cuentas.body) ? cuentas.body : []).find((fila) => fila.isActive && fila.currency === 'PYG')
    expect(cuenta, 'hace falta una cuenta PYG activa').toBeTruthy()
    const pago = await page.evaluate(async ({ api, id, accountId }) => {
      const response = await fetch(`${api}/api/finance`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'workshopPartPayment', id, accountId }) })
      return { status: response.status, body: await response.json().catch(() => null) }
    }, { api: API, id: creado.body.id, accountId: cuenta.id })
    expect(pago.status, `POST finance: ${JSON.stringify(pago.body)}`).toBe(200)
    expect(Number(pago.body.deudaPyg)).toBe(0)

    const trasTaller = await traer('/api/workshop/parts?porPagar=1')
    const trasFin = await traer('/api/finance')
    expect(Number(trasTaller.body.resumen.porPagarPyg)).toBe(Number(antesTaller.body.resumen.porPagarPyg) - 350000)
    expect(Number(trasFin.body.workshopParts.totalPyg)).toBe(Number(antesFin.body.workshopParts.totalPyg) - 350000)
    expect(trasFin.body.workshopParts.rows.some((fila) => fila.id === creado.body.id)).toBe(false)

    const egreso = (trasFin.body.movements || []).find((fila) => fila.kind === 'SUPPLIER_ADVANCE' && fila.direction === 'OUT' && Number(fila.amountPyg) === 350000 && fila.accountId === cuenta.id)
    expect(egreso, 'el egreso del pago del taller').toBeTruthy()
    const auditoria = await traer('/api/audit?action=WORKSHOP_PART_PAID&limit=5')
    const filas = Array.isArray(auditoria.body) ? auditoria.body : auditoria.body?.rows || []
    expect(filas.some((fila) => fila.metadata?.desde === 'FINANZAS' && Number(fila.metadata?.deudaPyg) === 350000), 'auditoría desde FINANZAS').toBe(true)

    const repetido = await page.evaluate(async ({ api, id }) => {
      const response = await fetch(`${api}/api/finance`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'workshopPartPayment', id }) })
      return response.status
    }, { api: API, id: creado.body.id })
    expect(repetido, 'repetir el pago').toBe(400)
    return 'deuda 350000 Gs pagada y conciliada'
  })
} else {
  console.log('Modo producción: solo verificación de lectura (no se crean datos).')
}

await ver('Captura de Caja con la deuda del taller', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 25_000 })
  await page.screenshot({ path: join(SALIDA, 'caja-tras-pagar.png'), fullPage: true })
})

await browser.close()
const ok = resultados.filter((fila) => fila.ok).length
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ fecha: new Date().toISOString(), base: WEB, modo: MODO, resultados }, null, 2)}\n`)
console.log(`\n${ok}/${resultados.length} verificaciones OK (${MODO}) · evidencia en ${SALIDA.replace(`${RAIZ}/`, '')}`)
if (resultados.some((fila) => !fila.ok)) process.exit(1)
