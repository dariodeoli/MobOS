// Demo completa: cada rol (Dueño, Gerente, Vendedor, Caja, Técnico, Delivery y
// el portal del cliente vía «Ver como») recorre todas las vistas de su menú.
// Falla si una vista queda vacía, si aparece un estado vacío en la carga
// inicial, si hay errores de consola/página o si la demo toca un servicio que
// no sea la medición anónima (/api/public/track). Sin backend: la demo vive en
// el navegador.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

const PORTAL_CLIENTE = '/portal/demo-demo-cliente-lucia-completo'

const ANALISIS = ['reportes', 'ventas-dia', 'ganancias', 'ganadores', 'asistente'].map((t) => `/analisis/${t}`)
const FINANZAS = ['caja', 'gastos', 'bancos', 'conciliacion', 'creditos', 'cuotas', 'comisiones', 'publicidad'].map((t) => `/finanzas/${t}`)
const STOCK = ['unidades', 'taller', 'conteos', 'verificacion', 'alertas', 'reservas', 'traslados', 'transito', 'vendidos', 'ubicaciones', 'compartido', 'eliminados'].map((t) => `/stock/${t}`)
const CONFIG = ['organizacion', 'equipo', 'dispositivos', 'comercial', 'seguridad', 'sistema', 'mi-cuenta'].map((t) => `/configuracion/${t}`)

// Vistas del menú de cada rol (las que su navegación ofrece y su permiso abre).
const VISTAS = {
  dueno: {
    boton: 'Entrar como Dueño',
    rutas: [
      '/resumen', '/ops', '/pos', '/pedidos', '/cotizaciones', '/delivery', '/clientes', '/campanas', '/promociones', '/plantillas',
      '/productos', '/precios', '/celulares', '/comparador', '/centro-control', '/abastecimiento', '/compras-centro', '/preparacion',
      '/preparar-lote', '/recepcion', '/metricas', '/trade-in', '/compras', '/servicio', '/garantias', '/autorizaciones',
      ...ANALISIS, ...FINANZAS, ...STOCK, ...CONFIG, '/ayuda/ayuda',
    ],
  },
  GERENTE: {
    rol: /Gerente/,
    rutas: ['/pos', '/pedidos', '/cotizaciones', '/delivery', '/clientes', '/campanas', '/promociones', '/plantillas', '/productos', '/precios', '/trade-in', '/mi-cuenta', '/ayuda/ayuda'],
  },
  VENDEDOR: {
    rol: /Vendedor/,
    rutas: ['/pos', '/pedidos', '/cotizaciones', '/delivery', '/clientes', '/promociones', '/plantillas', '/productos', '/trade-in', '/mi-cuenta', '/ayuda/ayuda'],
  },
  CAJERA: {
    rol: /Caja/,
    rutas: ['/pos', '/pedidos', '/cotizaciones', '/delivery', '/clientes', '/promociones', '/plantillas', '/productos', '/trade-in', '/mi-cuenta', '/ayuda/ayuda'],
  },
  TECNICO: {
    rol: /Técnico/,
    rutas: ['/servicio', '/mi-cuenta'],
  },
  REPARTIDOR: {
    rol: /Delivery/,
    rutas: ['/delivery/repartos', '/delivery/rendiciones', '/mi-cuenta'],
  },
}

// Estados vacíos que no pueden verse en la carga inicial de una vista de la demo.
const VACIOS = /Todavía no hay|Sin movimientos registrados|No hay pedidos en esta vista|No hay clientes en este segmento|Sin inversiones registradas|Sin créditos pendientes|Sin cuotas pendientes|Sin equipos acá|No hay unidades eliminadas|No hay órdenes|Sin resultados|No hay datos|La demo no consume|no está disponible en la demo/i

// La medición anónima (#438) es la única llamada al API permitida en la demo.
const esLlamadaApi = (url) => new URL(url).pathname.startsWith('/api/') && !url.includes('/api/public/track')
// Ruido conocido del arnés: la medición anónima fallida cuando no hay backend.
const ruidoConocido = (texto) => /Failed to load resource|ERR_UNSAFE_PORT|\/api\/public\/track/.test(texto)

async function entrarComo(page, clave) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño' }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuiaDemo(page)
  if (clave === 'dueno') return
  await page.getByTestId('demo-perspectivas-toggle').click()
  await page.getByTestId('demo-ver-como-menu').getByRole('menuitemradio', { name: VISTAS[clave].rol }).click()
  await expect(page.getByTestId('demo-rol-actual')).toHaveText(VISTAS[clave].rol)
  await cerrarGuiaDemo(page)
}

// Navegación interna (sin recargar): conserva la sesión demo y el estado en memoria.
async function irA(page, ruta) {
  await page.evaluate((destino) => {
    window.history.pushState({}, '', destino)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, ruta)
}

async function revisarVista(page, ruta, problemas) {
  await irA(page, ruta)
  const principal = page.locator('main').first()
  await expect(principal, `${ruta}: la vista no se pintó`).toBeVisible()
  // Espera a que la vista termine de cargar (esqueletos/«Cargando») y se estabilice.
  await expect.poll(async () => (await principal.innerText()).replace(/\s+/g, ' ').trim().length, { message: `${ruta}: vista vacía`, timeout: 10000 }).toBeGreaterThan(120)
  await expect(principal.getByText(/^Cargando/).first()).toBeHidden({ timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(350)
  const texto = (await principal.innerText()).replace(/\s+/g, ' ')
  const vacio = texto.match(VACIOS)
  if (vacio) problemas.push(`${ruta}: estado vacío «${vacio[0]}»`)
  const final = new URL(page.url()).pathname
  if (final !== ruta) problemas.push(`${ruta}: redirigió a ${final}`)
}

for (const [clave, vistas] of Object.entries(VISTAS)) {
  test(`demo completa · ${clave}: todas las vistas de su menú muestran datos y sin errores`, async ({ page }) => {
    test.setTimeout(clave === 'dueno' ? 300000 : 120000)
    const consola = []
    const llamadas = []
    page.on('console', (mensaje) => { if (mensaje.type() === 'error' && !ruidoConocido(mensaje.text())) consola.push(mensaje.text().slice(0, 240)) })
    page.on('pageerror', (error) => consola.push(`PAGEERROR ${String(error).slice(0, 240)}`))
    page.on('request', (peticion) => { if (esLlamadaApi(peticion.url())) llamadas.push(peticion.url()) })

    await entrarComo(page, clave)
    const problemas = []
    for (const ruta of vistas.rutas) {
      const antes = consola.length
      await revisarVista(page, ruta, problemas)
      for (const error of consola.slice(antes)) problemas.push(`${ruta}: consola «${error}»`)
    }
    expect(llamadas, 'la demo no puede llamar al API real').toEqual([])
    expect(problemas, problemas.join('\n')).toEqual([])
  })
}

test('demo completa · portal del cliente (Ver como → Cliente) muestra pedidos, saldo y garantías', async ({ page }) => {
  const consola = []
  page.on('console', (mensaje) => { if (mensaje.type() === 'error' && !ruidoConocido(mensaje.text())) consola.push(mensaje.text().slice(0, 240)) })
  page.on('pageerror', (error) => consola.push(`PAGEERROR ${String(error).slice(0, 240)}`))
  await entrarComo(page, 'dueno')
  await page.getByTestId('demo-perspectivas-toggle').click()
  await expect(page.getByTestId('demo-vista-cliente')).toHaveAttribute('href', PORTAL_CLIENTE)
  await page.goto(PORTAL_CLIENTE)
  await expect(page.getByText('Hola, Lucía Fernández')).toBeVisible()
  await expect(page.getByText('Tus pedidos')).toBeVisible()
  await expect(page.getByText('Tus garantías')).toBeVisible()
  await expect(page.getByText('No tenés garantías activas')).toHaveCount(0)
  await expect(page.getByText('Todavía no tenés saldo a favor')).toHaveCount(0)
  expect(consola).toEqual([])
})

test('demo completa · en 375px ninguna vista del Dueño ni del resto de roles desborda horizontalmente', async ({ page }) => {
  test.setTimeout(240000)
  const rutasMovil = ['/resumen', '/pos', '/pedidos', '/clientes', '/campanas', '/stock/unidades', '/stock/traslados', '/compras', '/servicio', '/finanzas/caja', '/finanzas/gastos', '/finanzas/creditos', '/finanzas/cuotas', '/finanzas/comisiones', '/analisis/reportes', '/configuracion/organizacion', '/ops']
  await entrarComo(page, 'dueno')
  await page.setViewportSize({ width: 375, height: 812 })
  const desbordes = []
  for (const ruta of rutasMovil) {
    await irA(page, ruta)
    await expect(page.locator('main').first()).toBeVisible()
    await page.waitForTimeout(600)
    const exceso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (exceso > 1) desbordes.push(`${ruta}: ${exceso}px`)
  }
  expect(desbordes, desbordes.join('\n')).toEqual([])
})
