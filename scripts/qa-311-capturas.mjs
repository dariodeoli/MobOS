// Capturas antes/después de Caja (#311) en claro, oscuro y móvil.
//
//   # «antes»: worktree con origin/main, servidor Vite en 5391
//   QA_BASE_URL=http://localhost:5391 QA_311_FASE=antes node scripts/qa-311-capturas.mjs
//   # «después»: la rama con el fix
//   QA_BASE_URL=http://localhost:5391 QA_311_FASE=despues node scripts/qa-311-capturas.mjs
//
// Deja las imágenes en docs/qa/311-caja-guiada/<fase>/ y las mediciones en
// mediciones-<fase>.json. Verifica que las duplas antes/después no sean iguales
// (`QA_311_SOLO_VERIFICAR=1` para correr solo esa comprobación).
/* global document */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5391').replace(/\/$/, '')
const FASE = process.env.QA_311_FASE || 'despues'
const RAIZ_CAPTURAS = process.env.QA_OUT || join(RAIZ, 'docs/qa/311-caja-guiada')
const SALIDA = join(RAIZ_CAPTURAS, FASE)
const SOLO_VERIFICAR = process.env.QA_311_SOLO_VERIFICAR === '1'
mkdirSync(SALIDA, { recursive: true })

const combinaciones = [
  ['claro-desktop', 'light', { width: 1280, height: 900 }],
  ['oscuro-desktop', 'dark', { width: 1280, height: 900 }],
  ['claro-mobile', 'light', { width: 390, height: 844 }],
]

const hashDe = (archivo) => createHash('sha256').update(readFileSync(archivo)).digest('hex')

/**
 * Verifica que «antes» y «después» sean estados distintos: si alguna dupla de
 * capturas comparable tiene el mismo SHA-256, la evidencia no sirve (pasó una
 * vez: dos corridas del mismo árbol). Falla con código 1 y lo explica.
 *
 * No se comparan las páginas cuya cáscara no cambia a propósito (Bancos: la
 * grilla es la misma; lo que cambia es el alta en cajón y el switch, que van
 * en `bancos-alta-*` y en mediciones.json).
 */
function verificarDuplas() {
  const dirAntes = join(RAIZ_CAPTURAS, 'antes')
  const dirDespues = join(RAIZ_CAPTURAS, 'despues')
  const noComparables = (archivo) => /^bancos-(claro|oscuro|mobile)/.test(archivo) && !archivo.includes('-alta-')
  let archivos
  try { archivos = readdirSync(dirAntes).filter((f) => f.endsWith('.png') && !noComparables(f)) } catch { return true }
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

async function entrarDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 20_000 })
  // Guía de bienvenida de la demo (#201): si aparece, se cierra para no tapar
  // las capturas.
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
  const capturar = (nombre, locator = null) => (locator ? locator.screenshot({ path: join(SALIDA, `${nombre}-${sufijo}.png`) }) : page.screenshot({ path: join(SALIDA, `${nombre}-${sufijo}.png`), fullPage: true }))

  // ── Caja: la página y el cierre guiado (si existe) ──────────────────
  await page.goto(`${BASE}/finanzas/caja`, { waitUntil: 'networkidle' })
  await page.getByText('Saldo esperado').first().waitFor({ timeout: 20_000 })
  mediciones[`caja-${sufijo}`] = await page.evaluate(() => ({
    inputsConteoEnPagina: document.querySelectorAll('[id^="arqueo-"]').length,
    botonGuiado: Boolean([...document.querySelectorAll('button')].find((b) => /Contar y cerrar/i.test(b.textContent || ''))),
  }))
  await capturar('caja')
  const abrirCierre = page.getByRole('button', { name: 'Contar y cerrar' })
  if (await abrirCierre.count()) {
    await abrirCierre.click()
    const cierre = page.getByRole('dialog', { name: 'Cerrar caja' })
    await cierre.waitFor()
    await cierre.getByRole('button', { name: 'Por denominación' }).click()
    await cierre.getByRole('button', { name: /Agregar un billete de Gs 100\.000/ }).click()
    await cierre.getByRole('button', { name: /Agregar un billete de Gs 100\.000/ }).click()
    await capturar('caja-cierre', cierre)
    await page.keyboard.press('Escape')
  }

  // ── Gastos: la página y el alta en cajón ────────────────────────────
  await page.goto(`${BASE}/finanzas/gastos`, { waitUntil: 'networkidle' })
  await page.getByTestId('gastos-resumen').waitFor({ timeout: 20_000 })
  await capturar('gastos')
  const abrirGasto = page.getByRole('button', { name: 'Registrar movimiento' })
  if (await abrirGasto.count()) {
    await abrirGasto.click()
    const alta = page.getByRole('dialog', { name: 'Registrar salida, cheque o adelanto' })
    await alta.waitFor()
    await capturar('gastos-alta', alta)
    await page.keyboard.press('Escape')
  } else {
    // Antes (#311): el formulario vivía abierto dentro de la página.
    await capturar('gastos-alta', page.locator('form').filter({ has: page.locator('#monto-gasto') }))
  }

  // ── Bancos: la página, el alta y el switch descrito ─────────────────
  await page.goto(`${BASE}/finanzas/bancos`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Añadir cuenta' }).waitFor({ timeout: 20_000 })
  await capturar('bancos')
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  const formCuenta = page.locator('[data-testid="cuenta-form"]')
  await formCuenta.waitFor()
  mediciones[`bancos-${sufijo}`] = await page.evaluate(() => {
    const control = document.getElementById('pa-active')
    const descripcionId = control?.getAttribute('aria-describedby') || ''
    return {
      descripcionId,
      descripcion: descripcionId ? document.getElementById(descripcionId)?.textContent?.trim() || '' : '',
    }
  })
  await capturar('bancos-alta', formCuenta)
  await page.keyboard.press('Escape')

  // ── Conciliación: filas USD/USDT sin «USD 0,00» ─────────────────────
  await page.goto(`${BASE}/finanzas/conciliacion`, { waitUntil: 'networkidle' })
  await page.getByTestId('conciliacion-fila').first().waitFor({ timeout: 20_000 })
  mediciones[`conciliacion-${sufijo}`] = await page.evaluate(() => ({
    usdCero: [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && /USD 0,00/.test(el.textContent || '')).length,
    filasUsdt: [...document.querySelectorAll('[data-testid="conciliacion-fila"]')].filter((fila) => /USDT/.test(fila.textContent || '')).length,
  }))
  await capturar('conciliacion')

  writeFileSync(join(SALIDA, 'mediciones.json'), JSON.stringify({ fase: FASE, base: BASE, fecha: new Date().toISOString(), mediciones }, null, 2))
  console.log(`capturas ${FASE} · ${sufijo}: caja=${mediciones[`caja-${sufijo}`].botonGuiado ? 'guiada' : 'inline'} · usdCero=${mediciones[`conciliacion-${sufijo}`].usdCero}`)
  await contexto.close()
}
await navegador.close()

if (FASE === 'despues') {
  for (const [clave, valor] of Object.entries(mediciones)) {
    if (clave.startsWith('caja-') && !valor.botonGuiado) throw new Error(`después: Caja sin botón guiado (${clave})`)
    if (clave.startsWith('conciliacion-') && valor.usdCero !== 0) throw new Error(`después: quedan filas «USD 0,00» (${clave})`)
  }
  for (const [clave, valor] of Object.entries(mediciones)) {
    if (clave.startsWith('bancos-') && (!valor.descripcionId || !valor.descripcion)) throw new Error(`después: el switch «Cuenta activa» sin descripción (${clave})`)
  }
}
console.log(`\nListo: ${SALIDA}`)
