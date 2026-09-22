// Verificación en producción del informe y el certificado (#240) — ronda .142.
//
//   node scripts/qa-240-prod.mjs
//
// Lee la versión desplegada, busca las marcas del informe/certificado en los
// assets y, en la demo, abre la ficha de una unidad, el modal «Certificado» y
// captura el aviso honesto del demo. Si la versión todavía no tiene la ronda
// .142 (checklist de INV + impresión), lo deja dicho en el reporte.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const SALIDA = join(RAIZ, 'docs/qa/240-informe-dispositivo/prod')
const BASE = 'https://app.moboss.online'
mkdirSync(SALIDA, { recursive: true })

const MARCAS = {
  'Informe del dispositivo': 'informe',
  'Certificado de inspección': 'certificado',
  'certificado-phonecheck': 'tipo de trabajo',
  'Escaneá para abrir el informe público.': 'invitación al informe',
  PhoneCheck: 'checklist de INV',
  'blacklist mundial': 'aviso obligatorio',
}

const pasos = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })

try {
  // Entrar a la demo (misma puerta que el QA post-140) para leer la versión.
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await page.waitForTimeout(1800)
  const textoPantalla = await page.locator('body').innerText().catch(() => '')
  const version = (textoPantalla.match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''
  await page.screenshot({ path: join(SALIDA, '00-panel-demo.jpg'), type: 'jpeg', quality: 72 })

  // Assets desplegados (los que la app cargó, chunks lazy incluidos).
  const cargados = await page.locator('script[src]').evaluateAll((nodos) => nodos.map((nodo) => nodo.src))
  const html = await (await fetch(BASE)).text()
  const assets = [...new Set([...cargados.map((url) => url.replace(`${BASE}/`, '')), ...[...html.matchAll(/assets\/[A-Za-z0-9_\-]+\.js/g)].map((m) => m[0])])]
  const bundles = await Promise.all(assets.slice(0, 20).map(async (ruta) => (await fetch(`${BASE}/${ruta}`)).text().catch(() => '')))
  const codigo = bundles.join('\n')
  const marcas = Object.fromEntries(Object.entries(MARCAS).map(([marca, clave]) => [clave, codigo.includes(marca)]))
  pasos.push({ paso: 'versión desplegada', detalle: version ? `v${version}` : '(sin versión visible)', ok: Boolean(version) })
  pasos.push({ paso: 'assets desplegados revisados', detalle: assets.length ? `${assets.length} assets` : 'sin assets', ok: assets.length > 0 })
  for (const [clave, presente] of Object.entries(marcas)) pasos.push({ paso: `marca: ${clave}`, detalle: presente ? 'presente' : 'ausente', ok: presente })

  // Demo: la ficha de una unidad y el modal del certificado.
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const fila = page.getByTestId('inventario-fila').first()
  if (await fila.count()) {
    await fila.click()
    await page.waitForTimeout(800)
    const ficha = page.getByRole('dialog')
    await page.screenshot({ path: join(SALIDA, '01-ficha-demo.jpg'), type: 'jpeg', quality: 72 })
    const botonCertificado = ficha.getByRole('button', { name: 'Certificado', exact: true })
    const botonInforme = ficha.getByRole('button', { name: 'Informe', exact: true })
    pasos.push({ paso: 'demo: botón Informe en la ficha', detalle: (await botonInforme.count()) ? 'presente' : 'ausente', ok: (await botonInforme.count()) > 0 })
    pasos.push({ paso: 'demo: botón Certificado en la ficha', detalle: (await botonCertificado.count()) ? 'presente' : 'ausente', ok: (await botonCertificado.count()) > 0 })
    if (await botonCertificado.count()) {
      await botonCertificado.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(SALIDA, '02-certificado-demo.jpg'), type: 'jpeg', quality: 72 })
      const modal = page.getByRole('dialog').filter({ hasText: 'Certificado de inspección' })
      const aviso = await modal.locator('body, div').first().innerText().catch(() => '')
      writeFileSync(join(SALIDA, 'modal-certificado.txt'), aviso.slice(0, 4000))
      const imprimir = modal.getByRole('button', { name: 'Impresión directa' })
      if (await imprimir.count()) {
        await imprimir.click()
        await page.waitForTimeout(2000)
        const cuerpo = await page.locator('body').innerText()
        const avisoDemo = cuerpo.match(/No se pudo imprimir[^\n]*|Certificado[^\n]*|demo[^\n]*imprim[^\n]*/i)
        await page.screenshot({ path: join(SALIDA, '03-aviso-demo.jpg'), type: 'jpeg', quality: 72 })
        writeFileSync(join(SALIDA, 'aviso-demo.txt'), (avisoDemo ? avisoDemo[0] : '(sin aviso detectado)'))
        pasos.push({ paso: 'demo: impresión directa', detalle: avisoDemo ? avisoDemo[0].slice(0, 120) : '(sin aviso detectado)', ok: true })
      }
    }
  } else {
    pasos.push({ paso: 'demo: ficha de una unidad', detalle: 'no se encontró ninguna fila', ok: false })
  }
} catch (error) {
  pasos.push({ paso: 'error', detalle: String(error?.message || error).slice(0, 200), ok: false })
} finally {
  await browser.close()
}

const ok = pasos.filter((paso) => paso.ok).length
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Producción #240: ${ok}/${pasos.length} pasos OK`)
for (const paso of pasos) console.log(`${paso.ok ? '✅' : '⚠️'} ${paso.paso}: ${paso.detalle}`)
