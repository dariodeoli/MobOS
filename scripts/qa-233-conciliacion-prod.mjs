// Verificación en producción de la conciliación IMEI desde el registro (#233).
//
//   node scripts/qa-233-conciliacion-prod.mjs
//
// En la demo pública: crea una consulta simulada en una unidad, la busca en
// «Consultas IMEI», abre el modal «Conciliar consulta IMEI», guarda y comprueba
// que el registro quede conciliado. Capturas + reporte en
// docs/qa/233-conciliacion-imei/prod/. Si la ronda todavía no está desplegada
// (v1.0.145) lo dice en el reporte en vez de romper.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serialDemo } from '../src/lib/demo/iphones.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/233-conciliacion-imei/prod')
mkdirSync(SALIDA, { recursive: true })

const MARCAS = {
  'Conciliar consulta IMEI': 'el modal de conciliación',
  'Guardar conciliación': 'la acción de guardado',
  'iCloud/US Block clean ≠ blacklist mundial': 'la aclaración obligatoria',
}

const resultados = []
const assets = new Set()
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => { if (/\/assets\/.+\.js$/.test(peticion.url())) assets.add(peticion.url()) })

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (n) => { const archivo = await captura(n); capturas.push(archivo); return archivo })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre.replace(/[^\w]+/g, '-')}`)) } catch { /* sin captura */ }
  }
}

const serial = serialDemo(1)
let versionProduccion = ''
let rondaDesplegada = false

await paso('demo: entrar y leer la versión desplegada', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  // La guía de primera visita tapa clics.
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
    await guia.getByRole('button', { name: 'Cerrar' }).click()
  }
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''
  await shot('demo-panel')
  return versionProduccion ? `v${versionProduccion}` : '(sin versión visible)'
})

await paso('producción: marcas de la conciliación en los assets', async () => {
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await esperar(1500)
  const html = await (await fetch(`${BASE}/login`, { redirect: 'follow' })).text()
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  const bundles = await Promise.all([...assets].map(async (fuente) => (await fetch(fuente)).text().catch(() => '')))
  const codigo = bundles.join('\n')
  const faltantes = Object.entries(MARCAS).filter(([marca]) => !codigo.includes(marca)).map(([marca]) => marca)
  rondaDesplegada = faltantes.length === 0
  if (!rondaDesplegada) throw new Error(`la ronda no está desplegada (faltan: ${faltantes.join(' · ')})`)
  return `${assets.size} assets · ${Object.keys(MARCAS).length} marcas presentes`
})

if (!rondaDesplegada) {
  resultados.push({ paso: 'demo: flujo de conciliación', estado: 'pendiente', detalle: 'la ronda con la acción de conciliar todavía no está desplegada', capturas: [] })
}
if (rondaDesplegada) await paso('demo: consulta simulada en la unidad', async (shot) => {
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByTestId('imei-precheck').click()
  await ficha.getByTestId('imei-confirmar').click()
  await ficha.getByText(/Verificado|SIMULADO/).first().waitFor({ state: 'visible', timeout: 15000 })
  await shot('consulta-simulada')
  return `serial ${serial} · consulta simulada registrada`
})

if (rondaDesplegada) await paso('demo: conciliar desde el registro (modal + guardado)', async (shot) => {
  const ficha = page.getByRole('dialog')
  await ficha.getByTestId('imei-consultas-abrir').click()
  const ventana = page.getByRole('dialog', { name: 'Consultas IMEI · Conciliar' })
  await ventana.getByLabel('IMEI a consultar').fill(serial)
  await ventana.getByTestId('imei-consultas-buscar').click()
  const registro = ventana.getByTestId('imei-consultas-lista').locator('article').first()
  await registro.waitFor({ state: 'visible', timeout: 15000 })
  const boton = registro.getByRole('button', { name: 'Conciliar' })
  if (!(await boton.count())) throw new Error('el registro sigue siendo de solo lectura (sin botón Conciliar)')
  await shot('registro-con-boton')
  await boton.click()
  const modal = page.getByRole('dialog', { name: 'Conciliar consulta IMEI' })
  await modal.waitFor({ state: 'visible', timeout: 15000 })
  await modal.getByText('iCloud/US Block clean ≠ blacklist mundial', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  const notaPrecargada = await modal.getByLabel('Nota de conciliación').inputValue()
  if (!/iCloud\/US Block clean ≠ blacklist mundial/.test(notaPrecargada)) throw new Error('la nota no llega con la aclaración obligatoria')
  await modal.getByLabel('Costo real USD').fill('0.06')
  await modal.getByLabel('Orden del proveedor').fill('ORD-233-PROD')
  await shot('modal-conciliar')
  await page.getByTestId('imei-conciliar-guardar').click()
  await page.getByText('Consulta conciliada.').waitFor({ state: 'visible', timeout: 15000 })
  await registro.getByText(/Conciliada el/).waitFor({ state: 'visible', timeout: 10000 })
  await registro.getByText(/ORD-233-PROD/).waitFor({ state: 'visible', timeout: 10000 })
  await shot('registro-conciliado')
  return 'modal con aclaración precargada · guardado · registro conciliado con la orden'
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  rondaDesplegada,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'produccion.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  serial,
  resultados,
  assets: [...assets],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const lineas = [
  '# Conciliación IMEI desde el registro (#233) · verificación en producción',
  '',
  `- Producción: ${BASE} · versión v${versionProduccion || '?'} · ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK`,
  `- Ronda con la acción de conciliar (v1.0.145): **${rondaDesplegada ? 'desplegada' : 'todavía sin desplegar'}**`,
  rondaDesplegada ? '' : '- Cuando la ronda esté en producción, este mismo script corre la verificación completa y deja las capturas.',
  '',
  '## Marcas en los assets desplegados',
  '',
  ...Object.entries(MARCAS).map(([marca, que]) => `- ${rondaDesplegada ? '✅' : '⏳'} \`${marca}\` — ${que}`),
  '',
  '## Pasos',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Notas',
  '',
  '- La auditoría (`auditLog IMEI_QUERY_CONCILIATED`) se verifica en el e2e con backend real (`e2e/imei-mock.spec.js`): en la demo la consulta vive en el navegador y no hay sesión real para consultar `/api/audit`.',
  '- El modal precarga la nota con la aclaración «iCloud/US Block clean ≠ blacklist mundial» y la muestra como ayuda.',
  `- Errores de consola durante la corrida: ${erroresConsola.length}.`,
  '',
].filter((linea) => linea !== undefined).join('\n') + '\n'
writeFileSync(join(SALIDA, 'REPORTE.md'), lineas)

console.log(`\nVeredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ronda ${rondaDesplegada ? 'desplegada' : 'pendiente'} · ${erroresConsola.length} errores de consola`)
console.log(`Evidencia: ${SALIDA}`)
