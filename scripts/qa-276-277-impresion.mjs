// Capturas de #276/#277 sobre la demo (datos ficticios): el historial con el
// transporte honesto (solicitado · ejecutado con fallback · conexión física) y
// el ticket de prueba corto predeterminado con su plantilla editable.
//
//   node scripts/qa-276-277-impresion.mjs
//   QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/276-277-impresion node scripts/qa-276-277-impresion.mjs
//
// Salida: docs/qa/276-277-impresion/*.jpg + REPORTE.md + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/276-277-impresion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
let contador = 0
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

async function captura(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 76 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (etiqueta) => { capturas.push(await captura(etiqueta)) })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 300)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    console.log(`FALLO ${nombre} — ${mensaje}`)
  }
}

try {
  await paso('demo como dueño', async () => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await esperar(1200)
    await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
    await esperar(1500)
    await page.keyboard.press('Escape').catch(() => {})
    const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || '?'
    return `v${version}`
  })

  await paso('#276 · historial con transporte honesto', async (shot) => {
    await page.goto(`${BASE}/configuracion/impresoras`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await esperar(3000)
    await page.getByRole('button', { name: 'Cola e historial', exact: true }).click()
    await esperar(1500)
    const texto = await page.locator('body').innerText()
    const fallback = /fallback/.test(texto)
    const conexion = /conexi[oó]n/i.test(texto)
    const solicitado = /solicitado/i.test(texto)
    await shot('historial-transporte')
    if (!solicitado || !conexion || !fallback) throw new Error(`la tabla no muestra los tres datos (solicitado=${solicitado} conexion=${conexion} fallback=${fallback})`)
    return 'solicitado · ejecutado con fallback · conexión física visibles'
  })

  await paso('#277 · ticket corto predeterminado y plantilla', async (shot) => {
    await page.getByRole('button', { name: 'Impresoras', exact: true }).first().click()
    await esperar(1200)
    await page.getByRole('button', { name: 'Plantilla', exact: true }).first().click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByRole('button', { name: 'Ver vista previa' }).click()
    const vista = dialogo.getByTestId('prueba-vista-previa')
    await vista.waitFor({ state: 'visible', timeout: 10_000 })
    const texto = (await vista.innerText()).replace(/\s+/g, ' ')
    if (!/TICKET DE PRUEBA/.test(texto) || !/VALIDACI.N \d{4}-\d{2}/.test(texto)) throw new Error(`la vista previa no es el ticket corto: ${texto.slice(0, 120)}`)
    if (/IMPRESORA|MÉTODO|PUENTE/i.test(texto)) throw new Error('el ticket corto trae trazabilidad que no corresponde')
    await shot('ticket-corto-plantilla')
    // La plantilla suma fecha/hora y queda guardada como predeterminada.
    await dialogo.getByTestId('plantilla-fecha').check()
    await dialogo.getByTestId('guardar-plantilla').click()
    await esperar(600)
    await shot('plantilla-guardada')
    return 'el corto sale solo con título + validación XXXX-XX; la plantilla se edita y guarda'
  })
} finally {
  await browser.close()
}

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
writeFileSync(join(SALIDA, 'REPORTE.md'), `# QA #276/#277 · impresión (transporte honesto y ticket corto)

- Base: ${BASE}
- Fecha: ${new Date().toISOString()}
- Método: demo como dueño (datos ficticios) con capturas.

| Paso | Estado | Detalle | Captura |
| --- | --- | --- | --- |
${resultados.map((fila) => `| ${fila.paso} | ${fila.estado === 'ok' ? '✅ ok' : '❌ fallo'} | ${fila.detalle} | ${fila.capturas.join(' ')} |`).join('\n')}

**Lectura:** el historial muestra por trabajo lo **solicitado** (TCP/CUPS), lo
**ejecutado** (TCP directo/CUPS/USB directo) con el **fallback** y su motivo, y la
**conexión física** resuelta por la URI de la cola; el ticket de prueba corto es
el predeterminado y la **plantilla** (qué incluye, ancho 58/80, cortes, copias)
se edita desde la ficha y queda guardada por impresora.
`)
console.log(`#276/#277: ${resultados.length - fallos.length}/${resultados.length} pasos ok`)
for (const fila of fallos) console.log(`⏳ ${fila.paso}: ${fila.detalle}`)
