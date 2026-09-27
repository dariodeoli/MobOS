// QA #187 · plataforma en producción: versión publicada, PWA (manifest, service
// worker, shell offline) y capturas. Entra por la demo pública (sin
// credenciales). No modifica nada del sitio: solo lee y navega.
//
//   node scripts/qa-187-plataforma-produccion.mjs
//   QA_BASE_URL=http://localhost:5175 QA_OUT=docs/qa/... node scripts/qa-187-plataforma-produccion.mjs
//
// Evidencia: docs/qa/187-plataforma-produccion/ (capturas + resultados.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/187-plataforma-produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const hallazgos = []
let capturas = 0
async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
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

async function entrarDemoDueno(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForSelector('[data-testid="shell-perfil"], [data-testid="shell-bloquear"]', { timeout: 40_000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
const page = await contexto.newPage()
let salida = 0
try {
  // 1) Versión publicada (footer del shell) contra la del repo.
  let versionProd = '—'
  if (!(await paso('versión publicada', async (caps) => {
    await entrarDemoDueno(page)
    const texto = await page.evaluate(() => document.body.textContent || '')
    versionProd = (texto.match(/v\d+\.\d+\.\d+/) || ['—'])[0]
    const repo = (() => { try { return `v${JSON.parse(readFileSync(join(RAIZ, 'version.json'), 'utf8')).version}` } catch { return '—' } })()
    if (versionProd === '—') throw new Error('no se encontró la versión en el footer')
    if (repo !== '—' && versionProd !== repo) hallazgos.push(`La versión publicada (${versionProd}) no coincide con la del repo (${repo}).`)
    caps.push(await shot(page, 'shell-demo'))
    return `${versionProd} (repo ${repo})`
  }))) salida = 1

  // 2) Manifest e íconos.
  if (!(await paso('manifest e íconos de la PWA', async () => {
    const manifiesto = await page.evaluate(async (base) => {
      const respuesta = await fetch(`${base}/site.webmanifest`)
      if (!respuesta.ok) throw new Error(`manifest ${respuesta.status}`)
      return respuesta.json()
    }, BASE)
    if (!manifiesto.name || !manifiesto.short_name) throw new Error('manifest sin name/short_name')
    if (manifiesto.display !== 'standalone') hallazgos.push(`display del manifest: ${manifiesto.display}`)
    const faltantes = []
    for (const icono of manifiesto.icons || []) {
      const estado = await page.evaluate(async ({ base, src }) => (await fetch(`${base}${src}`, { method: 'HEAD' })).status, { base: BASE, src: icono.src })
      if (estado !== 200) faltantes.push(`${icono.src} → ${estado}`)
    }
    if (faltantes.length) throw new Error(`íconos: ${faltantes.join(', ')}`)
    return `${manifiesto.icons.length} íconos · ${manifiesto.display}`
  }))) salida = 1

  // 3) Service worker: servido, con versión de caché, y registrado en la página.
  if (!(await paso('service worker (sw.js) y registro', async () => {
    const sw = await page.evaluate(async (base) => {
      const respuesta = await fetch(`${base}/sw.js`)
      const texto = await respuesta.text()
      const cache = (texto.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1] || '—'
      const api = (texto.match(/API_CACHE\s*=\s*'([^']+)'/) || [])[1] || '—'
      return { estado: respuesta.status, tipo: respuesta.headers.get('content-type'), cache, api }
    }, BASE)
    if (sw.estado !== 200) throw new Error(`sw.js ${sw.estado}`)
    const registros = await page.evaluate(async () => {
      const lista = await navigator.serviceWorker.getRegistrations()
      return lista.map((registro) => ({ scope: registro.scope, activo: registro.active?.state || 'instalando' }))
    })
    if (!registros.length) throw new Error('la página no registró el service worker')
    return `caché ${sw.cache}/${sw.api} · ${registros.length} registro(s) ${registros[0].activo}`
  }))) salida = 1

  // 4) Shell offline: la página está controlada por el SW y el shell completo
  //    (incluido index.html) está precacheado. La recarga emulando offline se
  //    intenta como extra: `setOffline` de Playwright no siempre enruta por el
  //    service worker, así que su resultado no es un hallazgo por sí solo.
  if (!(await paso('shell offline (control + precache)', async (caps) => {
    const estado = await page.evaluate(async () => {
      const controlada = Boolean(navigator.serviceWorker.controller)
      const cache = await caches.open('mobos-shell-v4')
      const claves = (await cache.keys()).map((respuesta) => new URL(respuesta.url).pathname)
      return { controlada, claves }
    })
    if (!estado.controlada) throw new Error('la página no está controlada por el service worker')
    const faltan = ['/', '/index.html', '/site.webmanifest'].filter((url) => !estado.claves.includes(url))
    if (faltan.length) throw new Error(`shell sin precachear: ${faltan.join(', ')}`)
    caps.push(await shot(page, 'shell-precache'))
    let recargaOffline = 'no servida (limitación de setOffline con SW)'
    await contexto.setOffline(true)
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 })
      recargaOffline = 'servida desde la caché'
    } catch { /* limitación conocida del emulador */ } finally {
      await contexto.setOffline(false)
    }
    return `${estado.claves.length} archivos precacheados · recarga offline: ${recargaOffline}`
  }))) salida = 1

  // 4b) CI: racha y última roja (guardia), informativo.
  await paso('CI en main (guardia)', async () => {
    const { execFileSync } = await import('node:child_process')
    let texto = ''
    try {
      texto = execFileSync('node', ['scripts/qa-ci-guardia.mjs', '--minimo', '3'], { cwd: RAIZ, encoding: 'utf8' })
    } catch (error) {
      texto = String(error?.stdout || '')
    }
    const racha = (texto.match(/Racha en main: (\d+)\/\d+/) || [])[1] || '—'
    const roja = texto.split('\n').find((linea) => linea.startsWith('Última roja:')) || 'sin rojas recientes'
    if (racha !== '3') hallazgos.push(`CI: racha ${racha}/3 · ${roja.replace('Última roja: ', 'última roja ')}`)
    return `racha ${racha}/3 · ${roja.replace('Última roja: ', 'última roja ').slice(0, 80)}`
  })

  // 5) Vuelta a la normalidad (online) para la captura final.
  await paso('vuelta a online', async (caps) => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    caps.push(await shot(page, 'demo-online'))
    return 'recarga normal'
  })
} catch (error) {
  resultados.push({ paso: 'corrida', estado: 'fallo', detalle: String(error?.message || error).slice(0, 240), capturas: [] })
  salida = 1
} finally {
  await navegador.close()
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, version: resultados[0]?.detalle || '—', estado: salida === 0 ? 'verificado' : 'hallazgos', hallazgos, resultados }, null, 2))
  console.log(`\nResultado: ${salida === 0 ? 'VERIFICADO' : 'CON HALLAZGOS'}${hallazgos.length ? `\nHallazgos:\n- ${hallazgos.join('\n- ')}` : ''}`)
  console.log(`Evidencia en ${SALIDA}`)
}
process.exit(salida)
