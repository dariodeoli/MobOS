// Capturas antes/después de /demo (#328) en móvil 390×844, claro y oscuro.
// La captura es de viewport (no fullPage) para que se vea qué entra sin scroll,
// y se registran métricas de alto/scroll de la pantalla y de cada cápsula.
//   QA_BASE_URL=http://localhost:5391 QA_328_FASE=antes node scripts/qa-328-capturas.mjs
//   QA_BASE_URL=http://localhost:5391 QA_328_FASE=despues node scripts/qa-328-capturas.mjs
//   QA_328_SOLO_VERIFICAR=1 node scripts/qa-328-capturas.mjs   # exige antes ≠ después
/* global document, window */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5391').replace(/\/$/, '')
const FASE = process.env.QA_328_FASE || 'despues'
const RAIZ_CAPTURAS = process.env.QA_OUT || join(RAIZ, 'docs/qa/328-demo-acceso')
const SALIDA = join(RAIZ_CAPTURAS, FASE)
const SOLO_VERIFICAR = process.env.QA_328_SOLO_VERIFICAR === '1'
mkdirSync(SALIDA, { recursive: true })

// El pedido es móvil: 390×844 (iPhone 14/15). En cada tema se mide si la
// pantalla scrollea y si cada cápsula conserva un target de 44 px (#249).
const combinaciones = [
  ['claro-mobile', 'light'],
  ['oscuro-mobile', 'dark'],
]
const VIEWPORT = { width: 390, height: 844 }

const hashDe = (archivo) => createHash('sha256').update(readFileSync(archivo)).digest('hex')

/**
 * Verifica que «antes» y «después» sean estados distintos: si alguna dupla
 * tiene el mismo SHA-256, la evidencia no sirve (dos corridas del mismo árbol).
 * Falla con código 1 y lo explica.
 */
function verificarDuplas() {
  const dirAntes = join(RAIZ_CAPTURAS, 'antes')
  const dirDespues = join(RAIZ_CAPTURAS, 'despues')
  let archivos
  try { archivos = readdirSync(dirAntes).filter((f) => f.endsWith('.png')) } catch { return true }
  if (!archivos.length) return true
  const iguales = []
  const filas = []
  for (const archivo of archivos) {
    let antes
    let despues
    try { antes = hashDe(join(dirAntes, archivo)); despues = hashDe(join(dirDespues, archivo)) } catch { continue }
    filas.push(`  ${archivo} · antes ${antes.slice(0, 12)} · después ${despues.slice(0, 12)} ${antes === despues ? '❌ IGUALES' : '✅'}`)
    if (antes === despues) iguales.push(archivo)
  }
  console.log('\nDuplas antes/después:')
  for (const fila of filas) console.log(fila)
  if (iguales.length) {
    console.error(`\nERROR: ${iguales.length} captura(s) idénticas entre antes y después (${iguales.join(', ')}).\nEl «antes» tiene que salir de origin/main SIN el fix y el «después» de la rama CON el fix (dos builds distintos).`)
    return false
  }
  return true
}

if (SOLO_VERIFICAR) {
  process.exit(verificarDuplas() ? 0 : 1)
}

/** Métricas del viewport y de cada cápsula (alto, ancho y nombre accesible). */
async function medir(page) {
  return page.evaluate(() => {
    const raiz = document.scrollingElement || document.documentElement
    const botones = Array.from(document.querySelectorAll('main button'))
      .filter((b) => /Entrar como/.test(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`))
    return {
      scrollHeight: raiz.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: raiz.scrollWidth,
      innerWidth: window.innerWidth,
      perfiles: botones.map((b) => {
        const r = b.getBoundingClientRect()
        return { nombre: (b.getAttribute('aria-label') || '').trim(), ancho: Math.round(r.width), alto: Math.round(r.height) }
      }),
    }
  })
}

const navegador = await chromium.launch()
let fallas = 0
for (const [sufijo, tema] of combinaciones) {
  const contexto = await navegador.newContext({ viewport: VIEWPORT, colorScheme: tema })
  await contexto.addInitScript((valor) => { try { localStorage.setItem('mobos:theme', valor) } catch { /* sin storage */ } }, tema)
  const page = await contexto.newPage()
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' })
  // La app resuelve la sesión antes de mostrar la pantalla: se espera al PIN,
  // que según #235 está siempre visible.
  await page.waitForSelector('#demo-pin', { timeout: 20_000 })
  await page.waitForTimeout(300)

  const metricas = await medir(page)
  const sobra = metricas.scrollHeight - metricas.innerHeight
  const targets = metricas.perfiles.map((p) => p.alto)
  const minTarget = targets.length ? Math.min(...targets) : 0
  console.log(`\n[${FASE}] ${sufijo}: viewport ${metricas.innerWidth}×${metricas.innerHeight} · scrollHeight ${metricas.scrollHeight} (${sobra > 0 ? `SCROLL +${sobra}px` : 'entra sin scroll'}) · ancho ${metricas.scrollWidth}${metricas.scrollWidth > metricas.innerWidth ? ' ⚠ DESBORDA' : ''}`)
  console.log(`  cápsulas: ${metricas.perfiles.map((p) => `${p.nombre || '?'} ${p.ancho}×${p.alto}`).join(' · ') || 'ninguna'}`)
  console.log(`  target mínimo: ${minTarget}px ${minTarget >= 44 ? '✅' : '❌ <44px'}`)

  const archivo = join(SALIDA, `demo-${sufijo}.png`)
  await page.screenshot({ path: archivo })
  console.log('captura', archivo)
  if (!metricas.perfiles.length) { console.error('ERROR: no se encontraron cápsulas Entrar como <Rol>'); fallas += 1 }
  if (metricas.scrollWidth > metricas.innerWidth) { console.error('ERROR: desborde horizontal'); fallas += 1 }
  await contexto.close()
}
await navegador.close()
process.exit(verificarDuplas() && !fallas ? 0 : 1)
