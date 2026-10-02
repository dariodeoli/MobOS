// Capturas antes/después de Inicio (#310) en claro, oscuro y móvil, con foco
// en el primer viewport (el hallazgo: la tarjeta verde lo dominaba).
//
//   # «antes»: worktree con origin/main, servidor Vite en 5392
//   QA_BASE_URL=http://localhost:5392 QA_310_FASE=antes node scripts/qa-310-capturas.mjs
//   # «después»: la rama con el fix
//   QA_BASE_URL=http://localhost:5392 QA_310_FASE=despues node scripts/qa-310-capturas.mjs
//
// Deja las imágenes en docs/qa/310-inicio/ y las mediciones en
// mediciones-<fase>.json. Verifica que las duplas antes/después no sean iguales
// (`QA_310_SOLO_VERIFICAR=1` para correr solo esa comprobación).
/* global document, innerWidth, innerHeight */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5392').replace(/\/$/, '')
const FASE = process.env.QA_310_FASE || 'despues'
const RAIZ_CAPTURAS = process.env.QA_OUT || join(RAIZ, 'docs/qa/310-inicio')
const SALIDA = join(RAIZ_CAPTURAS, FASE)
const SOLO_VERIFICAR = process.env.QA_310_SOLO_VERIFICAR === '1'
mkdirSync(SALIDA, { recursive: true })

const combinaciones = [
  ['claro-desktop', 'light', { width: 1280, height: 900 }],
  ['oscuro-desktop', 'dark', { width: 1280, height: 900 }],
  ['claro-mobile', 'light', { width: 390, height: 844 }],
]

const hashDe = (archivo) => createHash('sha256').update(readFileSync(archivo)).digest('hex')

/**
 * Verifica que «antes» y «después» sean estados distintos: si alguna dupla de
 * capturas tiene el mismo SHA-256, la evidencia no sirve. Falla con código 1.
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
    console.error(`\nERROR: ${iguales.length} captura(s) idénticas entre antes y después (${iguales.join(', ')}).`)
    return false
  }
  return true
}

if (SOLO_VERIFICAR) {
  process.exit(verificarDuplas() ? 0 : 1)
}

async function entrarDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 20_000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  const aparecio = await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  if (aparecio) await guia.getByRole('button', { name: 'Cerrar' }).click()
}

const navegador = await chromium.launch()
const mediciones = {}
for (const [sufijo, tema, viewport] of combinaciones) {
  const contexto = await navegador.newContext({ viewport, colorScheme: tema })
  await contexto.addInitScript((valor) => { try { localStorage.setItem('mobos:theme', valor) } catch { /* sin storage */ } }, tema)
  const page = await contexto.newPage()
  await entrarDemo(page)
  await page.goto(`${BASE}/resumen`, { waitUntil: 'networkidle' })
  await page.getByText('Facturado').first().waitFor({ timeout: 20_000 })

  mediciones[`resumen-${sufijo}`] = await page.evaluate(() => {
    const indicadores = [...document.querySelectorAll('[data-testid^="indicador-"]')].map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-testid'),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        enPrimerViewport: rect.bottom <= innerHeight,
      }
    })
    const superficieVerde = [...document.querySelectorAll('body *')].some(
      (el) => typeof el.className === 'string' && /bg-gradient/.test(el.className) && /from-fono-dark/.test(el.className),
    )
    const etiquetas = ['Facturado', 'Cobrado', 'Por cobrar', 'Margen'].filter((t) => document.body.textContent.includes(t))
    return {
      viewport: { ancho: innerWidth, alto: innerHeight },
      indicadores,
      indicadoresEnPrimerViewport: indicadores.filter((i) => i.enPrimerViewport).length,
      superficieVerdeCompleta: superficieVerde,
      etiquetas,
    }
  })

  // Primer viewport (la evidencia del hallazgo) y página completa (contexto).
  await page.screenshot({ path: join(SALIDA, `inicio-primer-viewport-${sufijo}.png`) })
  await page.screenshot({ path: join(SALIDA, `inicio-completo-${sufijo}.png`), fullPage: true })
  writeFileSync(join(SALIDA, 'mediciones.json'), JSON.stringify({ fase: FASE, base: BASE, fecha: new Date().toISOString(), mediciones }, null, 2))
  console.log(`capturas ${FASE} · ${sufijo}: indicadores en primer viewport=${mediciones[`resumen-${sufijo}`].indicadoresEnPrimerViewport}/4 · superficie verde completa=${mediciones[`resumen-${sufijo}`].superficieVerdeCompleta}`)
  await contexto.close()
}
await navegador.close()

if (FASE === 'despues') {
  for (const [clave, valor] of Object.entries(mediciones)) {
    if (valor.indicadoresEnPrimerViewport !== 4) throw new Error(`después: no entran los 4 indicadores en el primer viewport (${clave}: ${valor.indicadoresEnPrimerViewport})`)
    if (valor.superficieVerdeCompleta) throw new Error(`después: quedó una superficie verde completa (${clave})`)
    if (valor.etiquetas.length !== 4) throw new Error(`después: faltan etiquetas del resumen (${clave}: ${valor.etiquetas.join(', ')})`)
  }
}
console.log(`\nListo: ${SALIDA}`)
