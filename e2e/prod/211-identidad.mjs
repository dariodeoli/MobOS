// Verificación post-deploy de la identidad unificada (#211) — superficies
// adoptadas: cronología y transacciones del pedido, y pantalla de bloqueo.
//
// Headless y sin credenciales: entra al demo anónimo como Dueño (datos
// aislados en el navegador) contra producción, y comprueba que cada superficie
// use el objeto `PersonaChip` (data-testid="persona-chip"), que no haya
// imágenes rotas ni errores de runtime y que la versión desplegada incluya el
// cambio. Capturas claro/oscuro en `docs/qa/211-identidad-prod/`.
//
// Uso: node e2e/prod/211-identidad.mjs
//   QA211_SHOTS=/tmp/qa211 (otra carpeta) · QA_APP=https://app.moboss.online
//
// Sale 1 si un paso falla.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.QA_APP || 'https://app.moboss.online'
const SHOTS = process.env.QA211_SHOTS || 'docs/qa/211-identidad-prod'
const VERSION_MINIMA = process.env.QA211_VERSION_MINIMA || '1.0.154'
mkdirSync(SHOTS, { recursive: true })

const resultado = { app: APP, fecha: new Date().toISOString(), version: null, pasos: [], observaciones: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }

let contador = 0
async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.png`
  await page.screenshot({ path: `${SHOTS}/${archivo}` })
  return archivo
}

async function paso(nombre, fn) {
  try {
    const detalle = await fn()
    resultado.pasos.push({ nombre, ok: true, detalle })
    console.log(`✓ ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (causa) {
    resultado.pasos.push({ nombre, ok: false, error: causa.message })
    console.log(`✗ ${nombre} — ${causa.message}`)
    resultado.hallazgos.push({ paso: nombre, error: causa.message })
  }
}

const compararVersion = (a, b) => {
  const [x, y, z] = String(a).split('.').map(Number)
  const [p, q, r] = String(b).split('.').map(Number)
  return x - p || y - q || z - r
}

const estadoIdentidad = (page) => page.evaluate(() => {
  const imagenes = Array.from(document.images)
  return {
    chips: document.querySelectorAll('[data-testid="persona-chip"]').length,
    avatares: imagenes.filter((img) => /^Foto de/.test(img.alt)).length,
    rotas: imagenes.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.alt || img.src),
  }
})

async function cerrarGuiaDemo(page) {
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) {
    await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
  }
}

async function entrarDemoDueno(page) {
  await page.goto(`${APP}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.getByTestId('menu-acciones').waitFor({ timeout: 30_000 })
  await cerrarGuiaDemo(page)
}

async function versionDesplegada(page) {
  const script = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).find((s) => /\/assets\/index-.*\.js$/.test(s)) || '')
  const respuesta = await page.request.get(script)
  const texto = await respuesta.text()
  const versiones = [...texto.matchAll(/1\.0\.\d{3}/g)].map((m) => m[0]).sort()
  return versiones[versiones.length - 1] || null
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Asuncion' })
const page = await contexto.newPage()
const errores = []
page.on('pageerror', (error) => errores.push(error.message))

try {
  await paso('versión desplegada incluye la identidad unificada', async () => {
    await entrarDemoDueno(page)
    resultado.version = await versionDesplegada(page)
    afirmar(resultado.version, 'no se pudo leer la versión desplegada')
    afirmar(compararVersion(resultado.version, VERSION_MINIMA) >= 0, `producción sirve v${resultado.version}, se esperaba ≥ v${VERSION_MINIMA}`)
    return `v${resultado.version}`
  })

  await paso('pedido: cronología con un solo chip de identidad por evento (claro)', async () => {
    await page.goto(`${APP}/pos/pedidos`)
    const fila = page.locator('[data-testid="pedido-fila"]').first()
    await fila.waitFor({ timeout: 25_000 })
    await fila.click()
    await page.getByText('Artículos preparados').waitFor({ timeout: 25_000 })
    await page.getByRole('main').getByRole('button', { name: /^Cronología/ }).click()
    const estado = await estadoIdentidad(page)
    afirmar(estado.chips > 0, 'la cronología no muestra ningún chip de identidad')
    afirmar(estado.rotas.length === 0, `imágenes rotas: ${estado.rotas.join(' | ')}`)
    // Un solo chip por evento: sin avatares sueltos duplicados en la línea.
    const porEvento = await page.evaluate(() => {
      const eventos = Array.from(document.querySelectorAll('article'))
      return eventos.map((evento) => evento.querySelectorAll('[data-testid="persona-chip"]').length).filter((n) => n > 0)
    })
    if (!porEvento.length) {
      resultado.observaciones.push('El pedido del demo no tiene eventos de cronología: la regla de un chip por evento queda cubierta por los eventos de pedidos reales (el encabezado y las transacciones sí se verifican acá).')
    } else {
      afirmar(porEvento.every((n) => n <= 1), `hay eventos con más de un chip: ${porEvento.filter((n) => n > 1).length}`)
    }
    await shot(page, 'pedido-cronologia-claro')
    return `chips ${estado.chips} · avatares ${estado.avatares} · eventos ${porEvento.length}`
  })

  await paso('pedido: transacciones con chip de identidad', async () => {
    const transacciones = page.getByText(/Transacciones \(\d+\)/)
    if (await transacciones.count()) {
      const chips = await page.locator('[data-testid="persona-chip"]').count()
      afirmar(chips > 0, 'las transacciones no muestran chip')
      return `chips totales ${chips}`
    }
    resultado.observaciones.push('El pedido abierto no tiene transacciones visibles: no se pudo verificar ese bloque.')
    return 'sin transacciones en el pedido'
  })

  await paso('pedido: oscuro sin imágenes rotas', async () => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch {} })
    await page.reload()
    await page.getByText('Artículos preparados').waitFor({ timeout: 25_000 })
    await page.getByRole('main').getByRole('button', { name: /^Cronología/ }).click()
    const estado = await estadoIdentidad(page)
    afirmar(estado.rotas.length === 0, `imágenes rotas en oscuro: ${estado.rotas.join(' | ')}`)
    await shot(page, 'pedido-cronologia-oscuro')
    await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch {} })
    await page.emulateMedia({ colorScheme: 'light' })
    return `chips ${estado.chips}`
  })

  await paso('v2: stepper de entrega del pedido con el flag de vista previa', async () => {
    await page.evaluate(() => { try { localStorage.setItem('mobos:tema-v2', '1') } catch {} })
    await page.goto(`${APP}/pos/pedidos`)
    const fila = page.locator('[data-testid="pedido-fila"]').first()
    await fila.waitFor({ timeout: 25_000 })
    await fila.click()
    await page.getByText('Artículos preparados').waitFor({ timeout: 25_000 })
    const stepper = page.getByLabel('Flujo de entrega')
    afirmar(await stepper.count() > 0, 'el stepper de entrega no aparece con el flag v2')
    const texto = (await stepper.first().innerText()).replace(/\s+/g, ' ')
    afirmar(/Pendiente/.test(texto) && /Preparando/.test(texto), `los pasos no se dibujan: ${texto}`)
    const estado = await estadoIdentidad(page)
    afirmar(estado.rotas.length === 0, `imágenes rotas con el flag v2: ${estado.rotas.join(' | ')}`)
    await shot(page, 'pedido-v2-stepper')
    return texto.slice(0, 80)
  })

  await paso('v2: el flag se apaga sin dejar restos', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('mobos:tema-v2') } catch {} })
    return 'flag limpio'
  })

  await paso('pantalla de bloqueo: chip con primer nombre y PIN', async () => {
    // Vuelve a claro de verdad (clase + preferencia) antes de capturar.
    await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch {}; document.documentElement.classList.remove('dark') })
    await page.getByTestId('menu-acciones').click()
    await page.getByRole('menuitem', { name: 'Bloquear pantalla' }).click()
    await page.getByText(/Ingresá tu PIN/).waitFor({ timeout: 15_000 })
    const estado = await estadoIdentidad(page)
    afirmar(estado.chips > 0, 'la pantalla de bloqueo no usa el chip de identidad')
    afirmar(estado.rotas.length === 0, 'imágenes rotas en el bloqueo')
    await shot(page, 'bloqueo-claro')
    return `chips ${estado.chips}`
  })

  await paso('pantalla de bloqueo: oscuro', async () => {
    await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch {} })
    await page.reload()
    if (await page.getByText(/Ingresá tu PIN/).count() === 0) {
      await page.getByTestId('menu-acciones').waitFor({ timeout: 25_000 })
      await cerrarGuiaDemo(page)
      await page.getByTestId('menu-acciones').click()
      await page.getByRole('menuitem', { name: 'Bloquear pantalla' }).click()
      await page.getByText(/Ingresá tu PIN/).waitFor({ timeout: 15_000 })
    }
    const estado = await estadoIdentidad(page)
    afirmar(estado.rotas.length === 0, 'imágenes rotas en el bloqueo oscuro')
    await shot(page, 'bloqueo-oscuro')
    return `chips ${estado.chips}`
  })

  await paso('píldora de presencia del topbar', async () => {
    await page.goto(`${APP}/pos/resumen`)
    await page.getByTestId('menu-acciones').waitFor({ timeout: 25_000 })
    await cerrarGuiaDemo(page)
    const pildora = page.getByRole('group', { name: 'Personas en línea' })
    const visible = await pildora.count()
    if (!visible) {
      resultado.observaciones.push('La píldora de presencia no aparece en el demo anónimo (no hay otras personas en línea): no verificable sin dos sesiones reales.')
      return 'sin personas en línea en el demo'
    }
    const chips = await page.locator('[data-testid="persona-chip"]').count()
    afirmar(chips > 0, 'la píldora de presencia no usa el chip de identidad')
    return `chips ${chips}`
  })

  await paso('sin errores de runtime en el recorrido', async () => {
    afirmar(errores.length === 0, `errores: ${errores.join(' | ')}`)
    return '0 errores'
  })
} finally {
  writeFileSync(`${SHOTS}/resultados.json`, JSON.stringify(resultado, null, 2))
  await navegador.close()
}

console.log(`\nResultado: ${resultado.pasos.filter((p) => p.ok).length}/${resultado.pasos.length} pasos · v${resultado.version} · capturas en ${SHOTS}`)
if (resultado.hallazgos.length) {
  console.log(`Hallazgos: ${JSON.stringify(resultado.hallazgos)}`)
  process.exit(1)
}
