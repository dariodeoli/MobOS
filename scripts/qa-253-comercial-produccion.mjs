// Verificación en PRODUCCIÓN del grupo Comercial de #253 (#251/#253) sobre el
// demo público: los cuatro bloques, los campos, el cruce con Autorizaciones y
// capturas. Falla en voz alta si el deploy todavía no trae el grupo.
//
// Uso: node scripts/qa-253-comercial-produccion.mjs
// Salida: docs/qa/config-comercial/produccion/*.png + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/config-comercial/produccion')
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion' })
const page = await ctx.newPage()

await ver('Demo: se entra como Dueño', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByRole('button', { name: 'Cerrar' }).click({ timeout: 5000 }).catch(() => {})
})

await ver('Comercial: los cuatro bloques del grupo están en producción', async () => {
  await page.goto(`${WEB}/configuracion/comercial`)
  await expect(page.getByTestId('config-comercial')).toBeVisible({ timeout: 20000 })
  for (const titulo of ['Seguro de ventas', 'Límites y autorizaciones', 'Fidelización y mora']) {
    await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible({ timeout: 20000 })
  }
  // En la demo las listas se avisan (no hay cuenta real); en una sesión real la
  // sección muestra «Listas de precios» y «Precios por cantidad».
  const listas = page.getByRole('heading', { name: 'Listas de precios', exact: true })
  const avisoDemo = page.getByText('Las listas de precios se configuran con una cuenta real')
  await expect(listas.or(avisoDemo).first()).toBeVisible({ timeout: 20000 })
  for (const id of ['#seguro-toggle', '#limite-gasto', '#limite-bajo-lista', '#limite-fidelizacion', '#limite-mora']) {
    await expect(page.locator(id)).toBeAttached()
  }
  return `h1: ${await page.locator('h1').first().innerText().catch(() => '—')}`
})
await ver('Comercial: captura desktop', async () => {
  await page.screenshot({ path: join(SALIDA, 'comercial-produccion-desktop.png'), fullPage: true })
})
await ver('Comercial: enlace a Autorizaciones', async () => {
  await expect(page.getByRole('link', { name: /Operación → Autorizaciones/ })).toHaveAttribute('href', '/autorizaciones')
})
await ver('Comercial: el deep link de precios entra a la sección', async () => {
  await page.goto(`${WEB}/configuracion/precios`)
  await expect(page).toHaveURL(/\/configuracion\/comercial$/, { timeout: 20000 })
  const listas = page.getByRole('heading', { name: 'Listas de precios', exact: true })
  const avisoDemo = page.getByText('Las listas de precios se configuran con una cuenta real')
  await expect(listas.or(avisoDemo).first()).toBeVisible({ timeout: 20000 })
})
await ver('Comercial: captura mobile', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${WEB}/configuracion/comercial`)
  await expect(page.getByTestId('config-comercial')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA, 'comercial-produccion-mobile.png'), fullPage: true })
})

const fallos = resultados.filter((r) => !r.ok)
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ web: WEB, fecha: new Date().toISOString(), resultados }, null, 2))
await browser.close()
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones en ${WEB}`)
if (fallos.length) {
  console.log('El grupo Comercial todavía no está completo en producción: integración/deploy pendiente.')
  process.exit(1)
}
console.log('Grupo Comercial verificado en producción. Capturas en ' + SALIDA)
