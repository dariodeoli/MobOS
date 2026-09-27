// Verificación en producción de #261 (cotización por WhatsApp/PDF) y de los
// impresos del abastecimiento (etiquetas/manifiesto), con capturas.
//
// Como la demo pública no tiene compras ni cotizaciones, los flujos con sesión
// no se pueden recorrer: además de las pantallas de la demo, este script baja
// el **JS servido** por producción y busca los marcadores de cada acción. Así
// distingue «no desplegado» de «no recorrible en la demo».
//
//   node scripts/qa-261-f3f4-produccion.mjs
//
// Salida: docs/qa/261-f3f4-produccion/ (capturas + REPORTE.md + resultados.json).
/* global document */
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

// Cada ítem se considera desplegado si el bundle servido trae sus marcadores
// (testids/textos que viajan en el JS de producción).
const ITEMS = [
  { item: 'F3 · etiquetas desde la preparación (tira + individual)', marcadores: ['etiquetas-preparacion-lista'], donde: '/preparacion (necesita una compra de una cuenta real)' },
  { item: 'F4 · manifiesto desde la recepción', marcadores: ['recepcion-manifiesto'], donde: '/recepcion (necesita una llegada de una cuenta real)' },
  { item: '#261 · enviar por WhatsApp (texto + PDF)', marcadores: ['cotizacion-whatsapp'], donde: 'Cotizaciones → Enlace/QR (oculto en la demo)' },
  { item: '#261 · PDF de la cotización (ventas)', marcadores: ['compartir-pdf'], donde: 'Cotizaciones → Enlace/QR (oculto en la demo)' },
  { item: '#261 · PDF en la página pública', marcadores: ['PDF de la cotización'], donde: '/cotizacion/<token> (el cliente real)' },
  { item: 'F3/F4 · manifiesto y etiquetas del lote (rama PRN)', marcadores: ['preparar-lote-manifiesto', 'preparar-lote-etiquetas'], donde: 'Preparar lote → abrir un lote' },
]

const pasos = []
const resultados = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)
const captura = (nombre) => page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 76, fullPage: true })

try {
  // Demo como dueño (sin credenciales), igual que el QA de impresión.
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await esperar(1800)
  const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''
  pasos.push({ paso: 'demo + versión', detalle: version ? `v${version}` : '(sin versión)', ok: Boolean(version) })

  // Pantallas del abastecimiento y de cotizaciones (capturas del estado servido).
  // Después de cada navegación se acumulan los scripts servidos de esa pantalla
  // (performance se resetea por navegación y los chunks son lazy).
  const trozos = []
  const acumularFuentes = async () => {
    const textos = await page.evaluate(async () => {
      const urls = new Set([
        ...[...document.querySelectorAll('script[src]')].map((script) => script.src),
        ...performance.getEntriesByType('resource').filter((entrada) => /\.(js|mjs)(\?|$)/.test(entrada.name)).map((entrada) => entrada.name),
      ])
      return Promise.all([...urls].map(async (url) => {
        try { return await (await fetch(url)).text() } catch { return '' }
      }))
    })
    trozos.push(...textos)
  }
  for (const [ruta, nombre] of [['/abastecimiento', '01-abastecimiento'], ['/preparar-lote', '02-preparar-lote'], ['/recepcion', '03-recepcion'], ['/preparacion', '06-preparacion'], ['/cotizaciones', '04-cotizaciones']]) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await esperar(2200)
    await captura(nombre)
    await acumularFuentes()
  }
  // Página pública de la cotización (demo): el bloque PDF se oculta a propósito
  // en demo (`!demo`), así que acá solo se verifica que la página sirva.
  await page.goto(`${BASE}/cotizacion/COT-DEMO-0007?demo=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2200)
  await captura('05-cotizacion-publica')
  await acumularFuentes()
  pasos.push({ paso: 'pantalla pública de la cotización', detalle: 'sirve en producción (demo)', ok: true })

  // JS servido: marcadores de cada acción (evidencia de despliegue).
  const fuentes = trozos.join('\n')
  pasos.push({ paso: 'JS servido analizado', detalle: `${(fuentes.length / 1024).toFixed(0)} KB de scripts`, ok: fuentes.length > 0 })

  for (const definicion of ITEMS) {
    const hallados = definicion.marcadores.filter((marcador) => fuentes.includes(marcador))
    const desplegado = hallados.length === definicion.marcadores.length
    resultados.push({
      item: definicion.item,
      estado: desplegado ? 'desplegado' : 'pendiente',
      detalle: desplegado
        ? `en la versión servida (${definicion.donde})`
        : `no está en la versión servida; se verifica en ${definicion.donde}`,
    })
  }
} catch (error) {
  pasos.push({ paso: 'error', detalle: String(error?.message || error).slice(0, 300), ok: false })
} finally {
  await browser.close()
}

const desplegados = resultados.filter((fila) => fila.estado === 'desplegado')
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos, resultados }, null, 2)}\n`)
writeFileSync(join(SALIDA, 'REPORTE.md'), `# Verificación en producción · #261 + impresos del abastecimiento

- Base: ${BASE}
- Fecha: ${new Date().toISOString()}
- Versión desplegada: ${pasos.find((paso) => paso.paso === 'demo + versión')?.detalle || '?'}
- Método: demo como dueño (sin credenciales) para las pantallas + **JS servido**
  por producción para los marcadores de cada acción (las pantallas con sesión no
  se pueden recorrer en la demo; la función la cubren los e2e).

| Ítem | Estado | Detalle |
| --- | --- | --- |
${resultados.map((fila) => `| ${fila.item} | ${fila.estado === 'desplegado' ? '✅ desplegado' : '⏳ pendiente'} | ${fila.detalle} |`).join('\n')}

## Pasos

${pasos.map((paso) => `- ${paso.ok ? '✅' : '⚠️'} ${paso.paso}: ${paso.detalle}`).join('\n')}

**Lectura**: ${desplegados.length}/${resultados.length} ítems están en la versión servida.
Los «pendiente» son de la rama \`slot/impresion\` (todavía sin integrar al momento
de esta corrida); al desplegarse, este mismo script los pasa a ✅ sin tocar nada.
`)
console.log(`Producción #261 + abastecimiento: ${desplegados.length}/${resultados.length} ítems desplegados`)
for (const fila of resultados) console.log(`${fila.estado === 'desplegado' ? '✅' : '⏳'} ${fila.item}`)
