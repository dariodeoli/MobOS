// Capturas antes/después de /login y /demo (#282) en claro, oscuro y móvil.
//   QA_BASE_URL=http://localhost:5290 QA_282_FASE=antes node scripts/qa-282-capturas.mjs
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5290').replace(/\/$/, '')
const FASE = process.env.QA_282_FASE || 'despues'
const RAIZ_CAPTURAS = process.env.QA_OUT || join(RAIZ, 'docs/qa/282-demo-login')
const SALIDA = join(RAIZ_CAPTURAS, FASE)
const SOLO_VERIFICAR = process.env.QA_282_SOLO_VERIFICAR === '1'
mkdirSync(SALIDA, { recursive: true })

const vistas = [
  ['login', '/login'],
  ['demo', '/demo'],
]
const combinaciones = [
  ['claro-desktop', 'light', { width: 1280, height: 860 }],
  ['oscuro-desktop', 'dark', { width: 1280, height: 860 }],
  ['claro-mobile', 'light', { width: 390, height: 844 }],
]

const hashDe = (archivo) => createHash('sha256').update(readFileSync(archivo)).digest('hex')

/**
 * Verifica que «antes» y «después» sean estados distintos: si alguna dupla
 * tiene el mismo SHA-256, la evidencia no sirve (pasó una vez: dos corridas del
 * mismo árbol). Falla con código 1 y lo explica.
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

const navegador = await chromium.launch()
for (const [nombre, ruta] of vistas) {
  for (const [sufijo, tema, viewport] of combinaciones) {
    const contexto = await navegador.newContext({ viewport, colorScheme: tema })
    await contexto.addInitScript((valor) => { try { localStorage.setItem('mobos:theme', valor) } catch { /* sin storage */ } }, tema)
    const page = await contexto.newPage()
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' })
    // La app resuelve la sesión antes de mostrar la pantalla: se espera al
    // ancla real de cada una (input de correo / PIN de la demo).
    await page.waitForSelector(ruta === '/login' ? '#mail' : '#demo-pin', { timeout: 20_000 })
    await page.waitForTimeout(300)
    const archivo = join(SALIDA, `${nombre}-${sufijo}.png`)
    await page.screenshot({ path: archivo, fullPage: true })
    console.log('captura', archivo)
    await contexto.close()
  }
}
await navegador.close()
process.exit(verificarDuplas() ? 0 : 1)
