// IA del menú (#251) · Capturas del menú principal nuevo: 8 grupos por flujo de
// trabajo, herramientas dentro de su sección (Promociones/Plantillas en Vender,
// Precios y la lista por modelo/comparador en Inventario, Autorizaciones y el
// tablero real en Operación), «Taller» como sección única y el menú del
// vendedor con su subconjunto. Corre sobre la demo en claro/oscuro y
// desktop/mobile; el «antes» sale de producción y el «después» de la rama.
//
// Uso: QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-menu-ia node scripts/qa-menu-ia.mjs
// Salida: docs/qa/menu-ia/<etiqueta>/<vista>-<tema>-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/menu-ia', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const TODAS = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'dark' },
]
// QA_VARIANTE=desktop-oscuro reintenta una sola vista (red inestable).
const VARIANTES = TODAS.filter((v) => !process.env.QA_VARIANTE || v.nombre === process.env.QA_VARIANTE)

const ESPERA = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RUTA_RESULTADOS = join(SALIDA, 'resultados.json')
let previos = []
try { previos = JSON.parse(readFileSync(RUTA_RESULTADOS, 'utf8')).resultados || [] } catch { previos = [] }
const resultados = []
const navegador = await chromium.launch()

// El menú vive en el lateral del shell (`shell-lateral`); `aside nav` es el
// fallback histórico.
const navDe = (page) => page.locator('[data-testid="shell-lateral"]').first().or(page.locator('aside nav').first())

// Lee el menú: títulos de grupo (toggles con aria-expanded) y sus ítems.
async function leerMenu(page) {
  const nav = navDe(page)
  if (!(await nav.count())) return null
  const grupos = await nav.locator('> div').evaluateAll((divs) => divs.map((div) => {
    const toggle = div.querySelector('button[aria-expanded]')
    const items = Array.from(div.querySelectorAll('button[aria-label]'))
      .filter((boton) => !boton.hasAttribute('aria-expanded'))
      .map((boton) => boton.textContent.trim())
    return { titulo: toggle ? toggle.textContent.trim() : null, items }
  }).filter((grupo) => grupo.titulo || grupo.items.length))
  const h1 = await page.locator('h1').first().innerText().catch(() => null)
  return { grupos, h1, url: await page.evaluate('location.pathname') }
}

async function entrarDemo(page, rol) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await ESPERA(1400)
  await page.getByRole('button', { name: new RegExp(`Entrar como ${rol}`) }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await ESPERA(2000)
  const entendido = page.getByRole('button', { name: 'Entendido' })
  if (await entendido.count()) await entendido.click().catch(() => {})
}

for (const variante of VARIANTES) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema }) => {
    try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin storage */ }
  }, { tema: variante.tema })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  const pasos = []
  const captura = (sufijo) => page.screenshot({ path: join(SALIDA, `${variante.nombre}-${sufijo}.jpg`), type: 'jpeg', quality: 74 })

  try {
    // ── Dueño ──────────────────────────────────────────────────────────
    await entrarDemo(page, 'Dueño')
    await captura('01-menu-dueno')
    const menuDueno = await leerMenu(page)
    pasos.push(`dueño en ${menuDueno?.url}: ${menuDueno?.h1}`)

    // Taller: sección única con pestañas internas.
    const taller = navDe(page).locator('button[aria-label="Taller y garantías"], button[aria-label="Servicio y Garantías"]')
    if (await taller.count()) {
      await taller.first().click()
      await ESPERA(1200)
      await captura('02-taller')
      const estado = {
        url: await page.evaluate('location.pathname'),
        h1: await page.locator('h1').first().innerText().catch(() => null),
        tabs: await page.locator('[role="group"] button').evaluateAll((botones) => botones.map((boton) => boton.textContent.trim()).slice(0, 6)),
      }
      pasos.push(`taller en ${estado.url}: ${estado.h1} · solapas ${estado.tabs.join(', ')}`)
    } else {
      pasos.push('taller: sin ítem en el menú')
    }

    // Tablero real (solo existe con el rollout de /ops).
    await page.goto(`${BASE}/ops`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await ESPERA(1500)
    const tablero = { url: await page.evaluate('location.pathname'), h1: await page.locator('h1').first().innerText().catch(() => null) }
    if (tablero.url === '/ops' && /tablero/i.test(tablero.h1 || '')) {
      await captura('03-tablero')
      pasos.push(`tablero: ${tablero.h1}`)
    } else {
      pasos.push(`tablero: no disponible (${tablero.url})`)
    }

    // ── Vendedor (contexto nuevo) ──────────────────────────────────────
    const contextoVendedor = await navegador.newContext({
      viewport: { width: variante.ancho, alto: variante.alto },
      deviceScaleFactor: 2,
    })
    await contextoVendedor.addInitScript(({ tema }) => {
      try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin storage */ }
    }, { tema: variante.tema })
    const pageVendedor = await contextoVendedor.newPage()
    pageVendedor.on('pageerror', (error) => errores.push(`vendedor: ${String(error.message).slice(0, 160)}`))
    await entrarDemo(pageVendedor, 'Vendedor')
    await pageVendedor.screenshot({ path: join(SALIDA, `${variante.nombre}-04-menu-vendedor.jpg`), type: 'jpeg', quality: 74 })
    const menuVendedor = await leerMenu(pageVendedor)
    pasos.push(`vendedor: ${menuVendedor?.grupos?.map((g) => g.titulo).join(' · ')}`)
    await contextoVendedor.close()

    resultados.push({ variante: variante.nombre, pasos, menuDueno, menuVendedor, errores })
  } catch (error) {
    errores.push(`sonda: ${String(error.message).slice(0, 220)}`)
    const previa = previos.find((r) => r.variante === variante.nombre)
    if (previa?.menuDueno) resultados.push({ ...previa, intentos: [...(previa.intentos || []), { etiqueta: ETIQUETA, errores }] })
    else resultados.push({ variante: variante.nombre, pasos, errores })
  }
  await contexto.close()
}

await navegador.close()
const orden = TODAS.map((v) => v.nombre)
const nombres = [...new Set([...previos.map((r) => r.variante), ...resultados.map((r) => r.variante)])]
const mezcla = nombres
  .map((nombre) => resultados.find((r) => r.variante === nombre) || previos.find((r) => r.variante === nombre))
  .sort((a, b) => orden.indexOf(a.variante) - orden.indexOf(b.variante))
writeFileSync(RUTA_RESULTADOS, JSON.stringify({ base: BASE, etiqueta: ETIQUETA, resultados: mezcla }, null, 2))
for (const fila of mezcla) {
  const m = fila.menuDueno
  console.log(`${fila.variante}: grupos [${(m?.grupos || []).map((g) => g.titulo).join(' · ')}] · ${(fila.pasos || []).join(' · ')} · errores ${fila.errores.length}`)
}
