// Capturas antes/después de /login y /demo (#282) en claro, oscuro y móvil.
//   QA_BASE_URL=http://localhost:5290 QA_282_FASE=antes node scripts/qa-282-capturas.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5290').replace(/\/$/, '')
const FASE = process.env.QA_282_FASE || 'despues'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/282-demo-login', FASE)
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
