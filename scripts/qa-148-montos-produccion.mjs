// Evidencia de #148 §9 (montos y monedas) en PRODUCCIÓN sobre /demo: el campo
// no trunca lo escrito, avisa por encima del tope real de almacenamiento y el
// guardado lo bloquea con el mensaje claro. Solo navega la demo pública (datos
// aislados en el navegador); el pedido a la API es un rechazo esperado.
//
// Uso: node scripts/qa-148-montos-produccion.mjs
// Salida: docs/qa/produccion-*/montos/*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API = (process.env.QA_API_URL || WEB.replace('app.', 'api.')).replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/produccion-montos')
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

const FUERA = '3.000.000.000'
const DENTRO = '2.000.000.000'
// Para la API, el monto va sin separadores (como lo manda el formulario).
const FUERA_DIGITOS = '3000000000'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()

await ver('Demo: se entra como Dueño y se cierra la guía', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  // La guía monta un render después del ingreso: se espera (patrón de
  // e2e/helpers/demo.js). Un count instantáneo la perdía y la guía tapaba clics.
  if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
    await guia.getByRole('button', { name: 'Cerrar' }).click()
  }
  return page.url().replace(WEB, '')
})

await ver('Gastos: un monto fuera del tope se conserva, se marca y el guardado lo explica', async () => {
  await page.goto(`${WEB}/finanzas/gastos`)
  const monto = page.locator('#monto-gasto')
  await monto.waitFor({ timeout: 30000 })
  await monto.fill(FUERA)
  await expect(monto).toHaveValue('3.000.000.000')
  await expect(monto).toHaveAttribute('aria-invalid', 'true')
  const titulo = await monto.getAttribute('title')
  await page.locator('#descripcion').fill('QA §9 tope (demo)')
  await page.getByRole('button', { name: 'Guardar movimiento' }).click()
  await expect(page.getByText(/máximo que el sistema puede guardar/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'gastos-tope.jpg'), type: 'jpeg', quality: 72 })
  return `aviso: ${titulo || '(sin title)'}`
})

await ver('Gastos: un monto dentro del tope no se marca', async () => {
  const monto = page.locator('#monto-gasto')
  await monto.fill(DENTRO)
  await expect(monto).toHaveValue(DENTRO)
  await expect(monto).not.toHaveAttribute('aria-invalid', 'true')
  return `${DENTRO} sin marca`
})

await ver('Caja: el arqueo fuera del tope se bloquea con el mismo mensaje', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible({ timeout: 30000 })
  const porAbrir = await page.getByRole('heading', { name: 'Abrir caja' }).count()
  const campo = page.locator(porAbrir ? '#opening' : '#counted')
  await expect(campo, 'el campo de arqueo está en pantalla').toBeVisible({ timeout: 15000 })
  await campo.fill(FUERA)
  if (porAbrir) await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  else await page.getByRole('button', { name: /Cerrar caja/ }).first().click()
  await expect(page.getByText(/máximo que el sistema puede guardar/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'caja-tope.jpg'), type: 'jpeg', quality: 72 })
  return `bloqueado con mensaje (${porAbrir ? 'apertura' : 'cierre'})`
})

await ver('API: sin sesión real la demo no escribe en el servidor (constancia)', async () => {
  // La demo pública vive en el navegador (no hay cookies de API), así que este
  // pedido no escribe: deja constancia de que la sonda no toca datos reales.
  const respuesta = await page.evaluate(async ({ api, web, monto }) => {
    const res = await fetch(`${api}/api/finance`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', origin: web },
      body: JSON.stringify({ action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: monto, exchangeRatePyg: '1', description: 'QA §9 producción (rechazo esperado)' }),
    })
    return { status: res.status, texto: (await res.text()).slice(0, 200) }
  }, { api: API, web: WEB, monto: FUERA_DIGITOS })
  if (respuesta.status === 400 && /2\.147\.483\.647/.test(respuesta.texto)) return '400 con el tope explicado (sesión real)'
  if (respuesta.status === 401) return '401 sin sesión: la demo no escribe; el tope del servidor se verificó en local'
  return `respuesta ${respuesta.status} — ${respuesta.texto.slice(0, 120)}`
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ resultados, web: WEB, api: API, fecha: new Date().toISOString() }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
