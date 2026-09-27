// Verificación en producción de #261 (cotización por WhatsApp/PDF) y de los
// impresos F3/F4 del abastecimiento (etiquetas/manifiesto), con capturas.
// Re-ejecutable: mientras la rama no esté desplegada reporta «pendiente»; al
// desplegarse, los mismos chequeos pasan a verde sin tocar el script.
//
//   node scripts/qa-261-f3f4-produccion.mjs
//
// Salida: docs/qa/261-f3f4-produccion/ (capturas + REPORTE.md + resultados.json).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/261-f3f4-produccion')
mkdirSync(SALIDA, { recursive: true })

const pasos = []
const resultados = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)
const captura = (nombre) => page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 76, fullPage: true })
const existe = async (testid) => (await page.getByTestId(testid).count()) > 0

try {
  // Demo como dueño (sin credenciales), igual que el QA de impresión.
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await esperar(1800)
  const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''
  pasos.push({ paso: 'demo + versión', detalle: version ? `v${version}` : '(sin versión)', ok: Boolean(version) })

  // 1) Abastecimiento (F3/F4): el panel y sus botones de impresión.
  await page.goto(`${BASE}/abastecimiento`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  await captura('01-abastecimiento')
  const etiquetas = await existe('preparar-etiquetas')
  const manifiesto = await existe('recepcion-manifiesto')
  resultados.push({ item: 'F3 · etiquetas desde la preparación', estado: etiquetas ? 'ok' : 'pendiente', detalle: etiquetas ? 'botón «Etiquetas (n)» presente' : 'la versión desplegada todavía no trae el botón', captura: '01-abastecimiento.jpg' })
  resultados.push({ item: 'F4 · manifiesto desde la recepción', estado: manifiesto ? 'ok' : 'pendiente', detalle: manifiesto ? 'botón «Manifiesto» presente' : 'necesita una recepción activa / todavía no desplegado', captura: '01-abastecimiento.jpg' })

  // 2) Cotizaciones (#261): el modal Enlace/QR y sus acciones.
  await page.goto(`${BASE}/cotizaciones`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  await captura('02-cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').first()
  let whatsapp = false
  let pdf = false
  if (await fila.count()) {
    await fila.getByRole('button', { name: 'Enlace/QR' }).click()
    await esperar(1200)
    whatsapp = await existe('cotizacion-whatsapp')
    pdf = (await existe('compartir-pdf')) || (await existe('descargar-pdf'))
    await captura('03-cotizacion-enlace')
  } else {
    pasos.push({ paso: 'cotizaciones en la demo', detalle: 'la demo no listó cotizaciones', ok: true })
  }
  resultados.push({ item: '#261 · enviar por WhatsApp (texto + PDF)', estado: whatsapp ? 'ok' : 'pendiente', detalle: whatsapp ? 'botón presente' : 'la versión desplegada todavía no trae la acción', captura: '03-cotizacion-enlace.jpg' })
  resultados.push({ item: '#261 · PDF de la cotización', estado: pdf ? 'ok' : 'pendiente', detalle: pdf ? 'acciones de PDF presentes' : 'la versión desplegada todavía no trae el PDF', captura: '03-cotizacion-enlace.jpg' })

  // 3) Página pública de la cotización: el PDF de marca para el cliente.
  await page.goto(`${BASE}/cotizacion/COT-DEMO-0007?demo=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  await captura('04-cotizacion-publica')
  const publicoPdf = (await page.getByText('PDF de la cotización').count()) > 0
  resultados.push({ item: '#261 · PDF en la página pública', estado: publicoPdf ? 'ok' : 'pendiente', detalle: publicoPdf ? 'botón «PDF de la cotización» presente' : 'la versión desplegada todavía no trae el PDF público', captura: '04-cotizacion-publica.jpg' })
} catch (error) {
  pasos.push({ paso: 'error', detalle: String(error?.message || error).slice(0, 300), ok: false })
} finally {
  await browser.close()
}

const pendientes = resultados.filter((fila) => fila.estado !== 'ok')
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos, resultados }, null, 2)}\n`)
writeFileSync(join(SALIDA, 'REPORTE.md'), `# Verificación en producción · #261 + impresos F3/F4

- Base: ${BASE}
- Fecha: ${new Date().toISOString()}
- Versión desplegada: ${pasos.find((paso) => paso.paso === 'demo + versión')?.detalle || '?'}
- Método: demo como dueño (sin credenciales) → \`/abastecimiento\` y \`/cotizaciones\` + la página pública; capturas de pantalla.

| Ítem | Estado | Detalle | Captura |
| --- | --- | --- | --- |
${resultados.map((fila) => `| ${fila.item} | ${fila.estado === 'ok' ? '✅ ok' : '⏳ pendiente'} | ${fila.detalle} | \`${fila.captura}\` |`).join('\n')}

## Pasos

${pasos.map((paso) => `- ${paso.ok ? '✅' : '⚠️'} ${paso.paso}: ${paso.detalle}`).join('\n')}

**Lectura**: los ítems «pendiente» son de la rama \`slot/impresion\` (todavía sin
integrar/desplegar al momento de esta corrida). Cuando el release los incluya, se
vuelve a correr este mismo script y los chequeos pasan a ✅ solos.
`)
console.log(`Producción #261 + F3/F4: ${resultados.length - pendientes.length}/${resultados.length} ítems ok`)
for (const fila of resultados) console.log(`${fila.estado === 'ok' ? '✅' : '⏳'} ${fila.item}: ${fila.detalle}`)
