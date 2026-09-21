// Demo pública anónima (#192): /demo entra por perfiles sin login, el panel
// funciona con datos ficticios sin tocar el API y sin sesión demo la navegación
// directa vuelve a /demo (no a /login).

import { test, expect } from '@playwright/test'
import { loginCompany, completeSellerPin } from './helpers/login.js'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')

// Cierra la guía "Cómo funciona la demo" si se abrió sola (primera visita).
async function cerrarGuia(page) {
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
}

// Recorre módulos en demo y devuelve problemas visibles + llamadas al API +
// errores de consola, para que el test afirme que todo el panel es navegable.
async function recorrerModulos(page, modulos) {
  const llamadas = []
  const errores = []
  let rutaActual = 'inicio'
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })
  page.on('console', (msg) => { if (msg.type() === 'error') errores.push(`[${rutaActual}] ${msg.text().slice(0, 140)} @ ${msg.location().url}:${msg.location().lineNumber}`) })
  page.on('pageerror', (error) => errores.push(`[${rutaActual}] pageerror: ${error.message.slice(0, 160)}`))

  const problemas = []
  for (const [ruta, titulo] of modulos) {
    rutaActual = ruta
    await page.goto(ruta)
    try {
      await expect(page.locator('h1')).toHaveText(titulo, { timeout: 15_000 })
    } catch {
      const visto = await page.locator('h1').innerText().catch(() => '—')
      problemas.push(`${ruta}: esperaba «${titulo}» y mostró «${String(visto).slice(0, 40)}»`)
      continue
    }
    const texto = await page.locator('body').innerText()
    for (const marca of ['Modo demo: la acción quedó simulada', 'No se pudieron cargar los datos', 'Tu sesión no tiene acceso', 'VITE_API_URL']) {
      if (texto.includes(marca)) problemas.push(`${ruta}: muestra «${marca}»`)
    }
  }
  return { problemas, llamadas, errores }
}

const MODULOS_VENDEDOR = [
  ['/pos', 'POS'],
  ['/pedidos', 'Mis pedidos'],
  ['/delivery', 'Delivery'],
  ['/clientes', 'Clientes'],
  ['/productos', 'Productos'],
  ['/promociones', 'Promociones'],
  ['/precios', 'Precios'],
  ['/cotizaciones', 'Cotizaciones'],
  ['/trade-in', 'Trade-In'],
]

const MODULOS_OWNER = [
  ['/pos', 'POS'],
  ['/pedidos', 'Mis pedidos'],
  ['/delivery', 'Delivery'],
  ['/clientes', 'Clientes'],
  ['/promociones', 'Promociones'],
  ['/precios', 'Listas de precios'],
  ['/cotizaciones', 'Cotizaciones'],
  ['/plantillas', 'Plantillas de WhatsApp'],
  ['/inventario', 'Unidades'],
  ['/compras', 'Compras'],
  ['/trade-in', 'Trade-In'],
  ['/servicio', 'Servicio Técnico'],
  ['/garantias', 'Garantías'],
  ['/autorizaciones', 'Autorizaciones'],
  ['/resumen', 'Resumen general'],
  ['/analisis', 'Reportes'],
  ['/finanzas', 'Caja'],
  ['/configuracion', 'Equipo'],
  ['/configuracion/identidad', 'Mi identidad'],
  ['/configuracion/roles', 'Roles y permisos'],
  ['/configuracion/negocio', 'Negocio'],
  ['/configuracion/precios', 'Listas de precios'],
  ['/configuracion/sucursales', 'Sucursales'],
  ['/configuracion/seguridad', 'Seguridad'],
  ['/configuracion/historial', 'Auditoría'],
  ['/configuracion/impresoras', 'Impresoras'],
  ['/configuracion/documentacion', 'Documentación'],
  ['/configuracion/sistema', 'Estado del sistema'],
]

test('la demo entra sin login, navega con datos ficticios y no toca el API', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: /Entrá al sistema/ })).toBeVisible()
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  await cerrarGuia(page)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  // Banner visible de datos ficticios.
  await expect(page.getByText(/datos ficticios/)).toBeVisible()

  // Módulos del vendedor con datos locales.
  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  await page.goto('/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

  // La recarga conserva la sesión demo (sessionStorage) y sigue todo local.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('dueño: un guardado en demo avisa que quedó simulado', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)
  await expect(page.getByText(/datos ficticios/)).toBeVisible()

  await page.goto('/configuracion/equipo')
  const panel = page.locator('#equipo-form')
  await expect(panel).toBeVisible()
  await panel.locator('#direct-name').fill(`Demo E2E ${Date.now().toString(36)}`)
  await panel.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()
  // El aviso de guardado simulado viaja en el toast (título + nota de demo).
  await expect(page.getByText('Cambio simulado en la demo')).toBeVisible()
  await expect(page.getByText(/no se guardó en la tienda/).first()).toBeVisible()

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('sin sesión demo, la navegación directa vuelve a /demo', async ({ page }) => {
  await page.goto('/resumen')
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('button', { name: /Entrar como Dueño/ })).toBeVisible()

  // La raíz también entra por la demo para anónimos.
  await page.goto('/')
  await expect(page).toHaveURL(/\/demo$/)

  // Y el acceso real sigue disponible desde la demo.
  await page.getByRole('link', { name: 'Ingresar con mi cuenta' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('todos los módulos del panel son navegables en demo', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)

  const { problemas, llamadas, errores } = await recorrerModulos(page, MODULOS_OWNER)
  expect(problemas, `módulos con problemas en demo:\n${problemas.join('\n')}`).toEqual([])
  expect(llamadas, `llamadas al API dentro de la demo:\n${llamadas.join('\n')}`).toEqual([])
  expect(errores, `errores de consola dentro de la demo:\n${errores.join('\n')}`).toEqual([])
})

test('el perfil vendedor también recorre sus módulos en demo', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  await cerrarGuia(page)

  const { problemas, llamadas, errores } = await recorrerModulos(page, MODULOS_VENDEDOR)
  expect(problemas, `módulos con problemas en demo (vendedor):\n${problemas.join('\n')}`).toEqual([])
  expect(llamadas, `llamadas al API dentro de la demo (vendedor):\n${llamadas.join('\n')}`).toEqual([])
  expect(errores, `errores de consola dentro de la demo (vendedor):\n${errores.join('\n')}`).toEqual([])
})

test('un guardado en demo no se persiste y al recargar vuelve el estado inicial', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)

  await page.goto('/configuracion/equipo')
  const filas = page.getByTestId('integrante-fila')
  // Esperar el seed de la demo antes de medir (la primera pintada puede venir vacía).
  await expect(filas.first()).toBeVisible()
  const antes = await filas.count()
  const nombre = `Demo persistencia ${Date.now().toString(36)}`
  await page.locator('#direct-name').fill(nombre)
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()
  await expect(filas.filter({ hasText: nombre })).toHaveCount(1)

  // Nada quedó escrito en localStorage (el espejo de la demo no se usa).
  const claves = await page.evaluate(() => Object.keys(localStorage))
  expect(claves.filter((clave) => clave.startsWith('fono:cache:v3'))).toEqual([])

  // Al recargar vuelve el estado demo: el integrante agregado desaparece.
  await page.reload()
  await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre })).toHaveCount(0)
  await expect(page.getByTestId('integrante-fila')).toHaveCount(antes)

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('la marca de demo no se filtra al login real de la misma pestaña', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)

  // Sin pasar por "Salir": ir al login real tiene que limpiar la marca de demo.
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })
  await loginCompany(page)
  expect(await page.evaluate(() => sessionStorage.getItem('mobos:demo-session'))).toBeNull()
  await completeSellerPin(page)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  // La sesión real usa el API de verdad: ya no hay barrera de demo.
  expect(llamadas.length, 'el login real tiene que llamar al API').toBeGreaterThan(0)
})