// Verificación del demo público anónimo (#192 / #196) — script reutilizable.
//
// Recorrido headless contra la demo publicada: entrada sin login (Vendedor 2001
// / Dueño 3001), panel en modo demo sin llamadas al API real, banner de datos
// ficticios, navegación anónima que vuelve a /demo y guardado simulado con
// nota. No usa sesiones ni datos reales: solo la demo pública.
//
// Uso:
//   node scripts/verificar-demo-publico.mjs                      # producción
//   QA_BASE_URL=http://localhost:5249 node scripts/verificar-demo-publico.mjs
//   QA_API_HOST=api.moboss.online QA_OUT=docs/qa/196-demo ...    # opcionales
//
// Salida: <QA_OUT>/*.jpg + resultados.json (incluye la versión desplegada y la
// lista de llamadas de red vistas durante el recorrido). Sale 1 si algún paso
// falla o si la demo tocó el API real.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/196-demo')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
let contador = 0
let versionDesplegada = null

async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(capturas)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

const browser = await chromium.launch()
const grabarRed = (page, permitidas = []) => page.on('request', (req) => {
  const url = req.url()
  if (!url.includes(API_HOST)) return
  if (permitidas.some((patron) => url.includes(patron))) return
  llamadasApi.push(url.slice(0, 160))
})

// 1) Entrada anónima a la demo (contexto limpio, sin cookies ni sesión demo).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  grabarRed(page)

  await paso('entrada anónima: /demo abre la entrada de perfiles sin login', async (capturas) => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    capturas.push(await shot(page, 'demo-entrada'))
    if (page.url().includes('/login')) throw new Error(`la demo redirigió a ${page.url()}`)
    const texto = await page.locator('body').innerText()
    versionDesplegada = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]
    const vendedor = page.getByRole('button', { name: /Entrar como Vendedor/ })
    const dueno = page.getByRole('button', { name: /Entrar como Dueño/ })
    if (!(await vendedor.count()) || !(await dueno.count())) throw new Error('no aparecen los perfiles Vendedor/Dueño')
    if (!(await page.getByText(/datos ficticios/i).count())) throw new Error('la entrada no avisa que los datos son ficticios')
    return `perfiles visibles sin login${versionDesplegada ? ` · versión ${versionDesplegada}` : ''}`
  })

  await paso('panel del vendedor en modo demo', async (capturas) => {
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
    await page.waitForTimeout(1800)
    capturas.push(await shot(page, 'panel-vendedor'))
    const texto = await page.locator('body').innerText()
    if (!/Nueva venta|Venta/i.test(texto)) throw new Error(`no abrió el POS (URL ${page.url()})`)
    if (!/datos ficticios/i.test(texto)) throw new Error('no se ve el banner de datos ficticios')
    return `panel abierto en ${page.url()}`
  })

  await paso('módulos del vendedor con datos locales', async (capturas) => {
    for (const [ruta, esperado] of [['/clientes', /Clientes/], ['/pedidos', /Mis pedidos|Pedidos/]]) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const texto = await page.locator('body').innerText()
      if (!esperado.test(texto)) throw new Error(`${ruta} no mostró su contenido`)
    }
    capturas.push(await shot(page, 'modulos-vendedor'))
    return 'clientes y pedidos cargan en demo'
  })

  await paso('navegación anónima sin sesión demo vuelve a /demo', async (capturas) => {
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const limpia = await anon.newPage()
    // Antes de la demo el chequeo de sesión (/api/auth/me) es esperado: solo se
    // vigilan las llamadas que ocurran ya dentro de la demo.
    grabarRed(limpia, ['/api/auth/me'])
    await limpia.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
    try {
      await limpia.waitForURL((url) => url.pathname === '/demo', { timeout: 25000 })
    } catch {
      capturas.push(await shot(limpia, 'anonimo-resumen'))
      const url = limpia.url()
      await anon.close()
      throw new Error(`sin sesión demo /resumen fue a ${url} (se esperaba /demo)`)
    }
    capturas.push(await shot(limpia, 'anonimo-demo'))
    await anon.close()
    return 'vuelve a /demo'
  })

  await ctx.close()
}

// 2) Dueño: guardado simulado con nota.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  grabarRed(page)

  await paso('dueño: un guardado avisa que quedó simulado', async (capturas) => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
    await page.goto(`${BASE}/configuracion/equipo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    await page.locator('#direct-name').fill(`Demo QA ${Date.now().toString(36)}`)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await page.waitForTimeout(1200)
    capturas.push(await shot(page, 'guardado-simulado'))
    const texto = await page.locator('body').innerText()
    if (!/Cambio simulado en la demo|no se guardó en la tienda/i.test(texto)) throw new Error('el guardado no muestra la nota de demo')
    return 'aviso de guardado simulado visible'
  })

  await ctx.close()
}

await browser.close()

// La demo no puede pegarle al API real en ningún paso.
const apiOk = llamadasApi.length === 0
const resumen = {
  base: BASE,
  apiVigilada: API_HOST,
  versionDesplegada,
  fecha: new Date().toISOString(),
  llamadasApi,
  demoNoTocaApi: apiOk,
  resultados,
}
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resumen, null, 2))
console.log(`\nVersión desplegada: ${versionDesplegada || 'desconocida'}`)
console.log(`Llamadas a ${API_HOST}: ${llamadasApi.length} ${apiOk ? '(OK: ninguna)' : '(FALLO)'}`)
console.log(`Fallos: ${resultados.filter(r => r.estado === 'fallo').length}/${resultados.length}`)
process.exitCode = resultados.some(r => r.estado === 'fallo') || !apiOk ? 1 : 0
