// Verificación en producción del header nuevo (#266): el candado bloquea, el
// chip de usuario (foto + nombre completo) va a Mi perfil y ya no están el menú
// de tres puntos, el ícono de persona ni el de recarga.
//
//   node scripts/qa-266-header-produccion.mjs
//   QA_BASE_URL=http://localhost:5175 QA_OUT=docs/qa/... node scripts/qa-266-header-produccion.mjs
//
// Entra por la demo pública (sin credenciales). Si la producción todavía sirve
// el header anterior (el cambio no está desplegado), lo informa y sale con
// código 2 para no confundir «pendiente de deploy» con un fallo real.
// Evidencia: docs/qa/266-shell-header/produccion/ (capturas + resultados.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/266-shell-header/produccion')
const PIN_DEMO_DUENO = '3001'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
let capturas = 0
async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 74 })
  return archivo
}

async function paso(nombre, fn) {
  const caps = []
  try {
    const detalle = await fn(caps)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: caps })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
    return true
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 240)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: caps })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    return false
  }
}

const versionProd = (page) => page.evaluate(() => (document.body.textContent.match(/v\d+\.\d+\.\d+[^\s·]*/) || ['—'])[0])

async function entrarDemoDueno(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForSelector('[data-testid="shell-perfil"], [data-testid="menu-acciones"]', { timeout: 40_000 })
  // La guía de la demo tapa el shell la primera vez.
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20_000 })
}

const navegador = await chromium.launch()
const page = await navegador.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
let salida = 0
let versionLeida = '—'
try {
  await entrarDemoDueno(page)
  const version = await versionProd(page)
  versionLeida = version
  const viejo = await page.getByTestId('menu-acciones').count()
  const nuevo = await page.getByTestId('shell-bloquear').count()
  if (!nuevo && viejo) {
    const captura = await shot(page, 'produccion-header-anterior')
    resultados.push({ paso: 'header nuevo desplegado', estado: 'pendiente-deploy', detalle: `producción ${version} todavía sirve el header anterior`, capturas: [captura] })
    console.log(`PENDIENTE DE DEPLOY  producción ${version} todavía tiene el header anterior (menú de tres puntos)`)
    writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, version, estado: 'pendiente-deploy', resultados }, null, 2))
    await navegador.close()
    process.exit(2)
  }

  if (!(await paso('candado en el header (sin menú de tres puntos)', async (caps) => {
    if (!nuevo) throw new Error('no aparece el candado shell-bloquear')
    if (viejo) throw new Error('sigue apareciendo el menú de tres puntos menu-acciones')
    if (await page.getByTestId('menu-acciones-lista').count()) throw new Error('sigue el panel del menú de tres puntos')
    if (await page.getByTestId('shell-mi-cuenta').count()) throw new Error('sigue el ícono de persona shell-mi-cuenta')
    caps.push(await shot(page, 'produccion-header-nuevo'))
    return version
  }))) salida = 1

  if (!(await paso('el chip va a Mi perfil con el nombre completo', async (caps) => {
    const chip = page.getByTestId('shell-perfil')
    const texto = (await chip.innerText()).replace(/\s+/g, ' ').trim()
    if (!texto) throw new Error('el chip no muestra nombre')
    await chip.click()
    await page.waitForURL(/\/mi-cuenta$/, { timeout: 25_000 })
    await page.getByTestId('mi-cuenta-perfil').waitFor({ timeout: 25_000 })
    caps.push(await shot(page, 'produccion-mi-perfil'))
    return texto
  }))) salida = 1

  if (!(await paso('el candado bloquea y el PIN desbloquea', async (caps) => {
    await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('shell-bloquear').waitFor({ timeout: 25_000 })
    await page.getByTestId('shell-bloquear').click()
    await page.getByTestId('pantalla-bloqueada').waitFor({ timeout: 15_000 })
    caps.push(await shot(page, 'produccion-bloqueo'))
    await page.locator('#lock-pin').pressSequentially(PIN_DEMO_DUENO)
    await page.getByTestId('pantalla-bloqueada').waitFor({ state: 'detached', timeout: 20_000 })
    caps.push(await shot(page, 'produccion-desbloqueado'))
    return 'PIN demo 3001'
  }))) salida = 1
} catch (error) {
  resultados.push({ paso: 'corrida', estado: 'fallo', detalle: String(error?.message || error).slice(0, 240), capturas: [] })
  console.log(`FALLO corrida: ${String(error?.message || error).slice(0, 240)}`)
  salida = 1
} finally {
  await navegador.close()
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, version: versionLeida, estado: salida === 0 ? 'verificado' : 'con-fallos', resultados }, null, 2))
  console.log(`\nResultado: ${salida === 0 ? 'VERIFICADO' : salida === 2 ? 'PENDIENTE DE DEPLOY' : 'CON FALLOS'} · evidencia en ${SALIDA}`)
}
process.exit(salida)
