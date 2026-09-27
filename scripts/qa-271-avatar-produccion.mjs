// Verificación post-deploy de #271 en producción: la versión publicada incluye
// el fix y la **foto vieja nunca se pinta** (perfil guardado o foto de Google
// servida por /me) mientras el avatar resuelve o al recargar el bloqueo.
//
//   node scripts/qa-271-avatar-produccion.mjs
//
// Entra por la demo pública (sin credenciales). La ventana exacta de ~1 s del
// flash asíncrono necesita una cuenta real; acá se verifica el contrato que la
// elimina: **nunca** se muestra una foto que no sea la resuelta para el usuario.
// Evidencia: docs/qa/271-avatar-produccion/ (capturas + resultados.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
const QRCode = require('qrcode')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/271-avatar-produccion')
const CLAVE_CONTEXTO = 'owncoding_hub_company_context'
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

const fotoVieja = `data:image/png;base64,${(await QRCode.toBuffer(`avatar-vieja-prod-${Date.now()}`)).toString('base64')}`
const repo = (() => { try { return `v${JSON.parse(readFileSync(join(RAIZ, 'version.json'), 'utf8')).version}` } catch { return '—' } })()

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
const page = await contexto.newPage()
let salida = 0
try {
  const entrarDemo = async () => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
    await page.waitForSelector('[data-testid="shell-perfil"], [data-testid="shell-bloquear"]', { timeout: 40_000 })
    const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
    if (await guia.count()) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
  }

  // Trampas: perfil guardado con foto vieja + /me con foto de Google vieja.
  await page.addInitScript(({ clave, foto }) => {
    try {
      const actual = JSON.parse(localStorage.getItem(clave) || '{}') || {}
      localStorage.setItem(clave, JSON.stringify({ ...actual, profile: { ...(actual.profile || {}), name: actual.profile?.name || 'Dueño', picture: foto } }))
    } catch { /* sin almacenamiento */ }
  }, { clave: CLAVE_CONTEXTO, foto: fotoVieja })
  await page.route('**/api/auth/me', async (ruta) => {
    const original = await ruta.fetch()
    const cuerpo = await original.json().catch(() => null)
    if (cuerpo && typeof cuerpo === 'object') {
      cuerpo.ownerProfile = { ...(cuerpo.ownerProfile || {}), name: cuerpo.ownerProfile?.name || 'Dueño', picture: fotoVieja }
      return ruta.fulfill({ response: original, json: cuerpo })
    }
    return ruta.fulfill({ response: original })
  })

  if (!(await paso('versión publicada = release con el fix', async (caps) => {
    await entrarDemo()
    const texto = await page.evaluate(() => document.body.textContent || '')
    const version = (texto.match(/v\d+\.\d+\.\d+/) || ['—'])[0]
    if (version === '—') throw new Error('sin versión visible')
    if (repo !== '—' && version !== repo) hallazgos.push(`Producción ${version} ≠ repo ${repo}`)
    caps.push(await shot(page, 'shell-demo'))
    return `${version} (repo ${repo})`
  }))) salida = 1

  if (!(await paso('la foto vieja nunca se pinta (shell)', async () => {
    const muestras = []
    for (let i = 0; i < 7; i += 1) {
      await page.waitForTimeout(350)
      muestras.push(...(await page.evaluate(() => [...document.querySelectorAll('img[alt^="Foto de"]')].map((imagen) => imagen.src))))
    }
    const viejas = muestras.filter((src) => src === fotoVieja)
    if (viejas.length) throw new Error(`la foto guardada/Google se pintó (${viejas.length} muestras)`)
    return `${muestras.length} muestras de src · ninguna es la foto vieja`
  }))) salida = 1

  if (!(await paso('la foto vieja tampoco aparece al recargar el bloqueo', async (caps) => {
    await page.getByTestId('shell-bloquear').click()
    await page.getByTestId('pantalla-bloqueada').waitFor({ timeout: 15_000 })
    const muestras = []
    for (let i = 0; i < 5; i += 1) {
      await page.waitForTimeout(300)
      muestras.push(...(await page.evaluate(() => [...document.querySelectorAll('img[alt^="Foto de"]')].map((imagen) => imagen.src))))
    }
    caps.push(await shot(page, 'bloqueo-demo'))
    if (muestras.some((src) => src === fotoVieja)) throw new Error('la foto vieja apareció en el bloqueo')
    return `${muestras.length} muestras · la foto vieja no aparece`
  }))) salida = 1
} catch (error) {
  hallazgos.push(`Corrida: ${String(error?.message || error).slice(0, 160)}`)
  salida = 1
} finally {
  await navegador.close()
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, repo, estado: salida === 0 ? 'verificado' : 'hallazgos', hallazgos, resultados }, null, 2))
  console.log(`\nResultado: ${salida === 0 ? 'VERIFICADO' : 'CON HALLAZGOS'}${hallazgos.length ? `\nHallazgos:\n- ${hallazgos.join('\n- ')}` : ''}`)
  console.log(`Evidencia en ${SALIDA}`)
}
process.exit(salida)
