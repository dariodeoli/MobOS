// Demo pública anónima (#192): /demo entra por perfiles sin login, el panel
// funciona con datos ficticios sin tocar el API y sin sesión demo la navegación
// directa vuelve a /demo (no a /login).

import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { loginCompany, completeSellerPin } from './helpers/login.js'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')

// Cierra la guía "Cómo funciona la demo" si se abrió sola (primera visita).
async function cerrarGuia(page) {
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
}

// Conteo real de filas del harness (#204): la demo no debe tocar la base.
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const linea = readFileSync('backend/.env', 'utf8').split('\n').find((item) => item.startsWith('DATABASE_URL='))
    return linea ? linea.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

async function contarFilas() {
  const url = databaseUrl()
  if (!url) return null
  const require = createRequire(new URL('../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    const tablas = ['User', 'Order', 'Customer', 'SuspendedSale', 'WarrantyCase', 'MessageTemplate']
    const filas = await Promise.all(tablas.map(async (tabla) => {
      const { rows } = await cliente.query(`SELECT count(*)::int AS n FROM "${tabla}"`)
      return [tabla, rows[0].n]
    }))
    return Object.fromEntries(filas)
  } finally {
    await cliente.end()
  }
}

// Foto de todo lo que el navegador puede guardar ente recargas (#201): la demo
// no debe agregar nada (ni claves, ni cookies, ni cachés, ni bases IndexedDB).
async function instantaneaNavegador(page) {
  return page.evaluate(async () => {
    const idb = indexedDB.databases ? (await indexedDB.databases()).map((base) => base.name).sort() : []
    const clavesCache = typeof caches !== 'undefined' ? (await caches.keys()).sort() : []
    const cachesContenido = {}
    for (const clave of clavesCache) {
      const cache = await caches.open(clave)
      cachesContenido[clave] = (await cache.keys()).map((pedido) => new URL(pedido.url).pathname).sort()
    }
    return {
      local: Object.keys(localStorage).sort(),
      sesion: Object.keys(sessionStorage).sort(),
      cookie: document.cookie,
      idb,
      caches: cachesContenido,
    }
  })
}

// Texto del resumen ya pintado: sirve para comparar el estado demo antes y
// después de una recarga.
async function textoResumen(page) {
  await expect(page.getByText('FACTURADO')).toBeVisible()
  await page.waitForTimeout(300)
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
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
  // Banner visible de datos ficticios y encabezado con la marca (#223).
  await expect(page.getByText(/datos ficticios/)).toBeVisible()
  await expect(page.getByTestId('shell-tienda')).toHaveText('MobOS')

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

// #213: el inventario demo ya no está bloqueado: muestra el lote de iPhones con
// IMEIs ficticios, costos y ubicaciones, todo local.
test('dueño: el inventario demo muestra unidades ficticias sin tocar el API', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })
  page.on('pageerror', (error) => console.log(`PAGEERROR ${error.message}`))

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await page.goto('/inventario/unidades')
  await expect(page.getByText(/Ingresá con una cuenta real/)).toHaveCount(0)

  const filas = page.getByTestId('inventario-fila')
  await expect(filas.first()).toBeVisible({ timeout: 15_000 })
  expect(await filas.count()).toBeGreaterThanOrEqual(20)
  await expect(page.getByText(/AUR0001/).first()).toBeVisible()

  await filas.first().click()
  const detalle = page.getByRole('dialog')
  await expect(detalle.getByText(/Costo del equipo/)).toBeVisible()
  await expect(detalle.getByText(/Depósito|Piso de venta/).first()).toBeVisible()

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

// #213: recorrido de punta a punta de los módulos con datos ficticios. Con
// MOBOS_213_CAPTURAS=<carpeta> deja capturas de cada pantalla.
test('dueño: recorrido demo con datos ficticios y capturas opcionales', async ({ page }) => {
  const salida = process.env.MOBOS_213_CAPTURAS || ''
  const capturar = async (nombre) => { if (salida) await page.screenshot({ path: `${salida}/${nombre}.png` }) }
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await capturar('00-resumen')

  const pantallas = [
    ['/inventario/unidades', /Inventario|Stock/i, '01-inventario'],
    ['/pedidos', /Pedidos/i, '02-pedidos'],
    ['/clientes', /Clientes/i, '03-clientes'],
    ['/finanzas/caja', /Caja/i, '04-caja'],
    ['/finanzas/conciliacion', /Conciliaci/i, '05-conciliacion'],
    ['/analisis/ganancias', /Ganancias/i, '06-ganancias'],
    ['/servicio-tecnico', /Servicio|Taller|Órdenes/i, '07-servicio'],
    ['/configuracion/impresoras', /Impresoras/i, '08-impresoras'],
  ]
  for (const [ruta, texto, nombre] of pantallas) {
    await page.goto(ruta)
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 15_000 })
    await capturar(nombre)
  }

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

test('la demo no persiste nada: guardados, recarga, salida y base intacta', async ({ page }) => {
  test.setTimeout(180_000)
  const antes = await contarFilas()
  test.skip(!antes, 'Requiere la base del harness (backend/.env con DATABASE_URL).')
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)
  const marca = Date.now().toString(36)
  const inicial = await instantaneaNavegador(page)
  const resumenInicial = await textoResumen(page)

  // Cinco guardados reales de la demo: integrante, plantilla, garantía, cupón
  // y una venta completa del POS.
  await page.goto('/configuracion/equipo')
  await page.locator('#direct-name').fill(`Cierre 201 ${marca}`)
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()

  await page.goto('/plantillas')
  await page.getByRole('button', { name: /Nueva plantilla/ }).click()
  await page.locator('#plantilla-nombre').fill(`Cierre 201 ${marca}`)
  await page.getByLabel('Mensaje de la plantilla').fill('Hola {{cliente}}, plantilla ficticia de cierre.')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(page.getByText('Plantilla creada.')).toBeVisible()

  await page.goto('/garantias')
  await page.getByRole('button', { name: 'Nuevo caso' }).click()
  await page.getByPlaceholder('Nombre del cliente').fill(`Cliente cierre ${marca}`)
  await page.getByPlaceholder('Serial o IMEI').fill(`AUR-C201-${marca}`)
  await page.getByPlaceholder('Falla reportada, revisión solicitada…').fill('Caso ficticio de cierre.')
  await page.getByRole('button', { name: 'Registrar caso' }).click()
  await expect(page.getByText(`Cliente cierre ${marca}`).first()).toBeVisible()

  const codigo = `C${marca.toUpperCase().slice(-6)}`
  await page.goto('/promociones')
  const formCupon = page.locator('form').filter({ hasText: 'Crear cupón' })
  await formCupon.getByLabel('Código').fill(codigo)
  await formCupon.getByLabel('Nombre').fill(`Cupón cierre ${marca}`)
  await formCupon.getByLabel('Inicio (hora local)').fill('2026-09-21T00:00')
  await formCupon.getByLabel('Fin (hora local)').fill('2030-01-01T00:00')
  await formCupon.getByRole('button', { name: 'Crear cupón' }).click()
  await expect(page.getByText(codigo).first()).toBeVisible()

  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente cierre POS ${marca}`)
  await page.getByPlaceholder('Buscar producto…').fill('iPhone')
  await page.getByRole('button', { name: /iPhone/ }).first().click()
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const pagos = page.locator('div.space-y-3').filter({ hasText: 'Pagos de esta venta' })
  await pagos.getByLabel('Cuenta de cobro').first().click()
  await page.getByRole('option', { name: /Caja · Guaraníes/ }).first().click()
  const dividir = pagos.getByRole('button', { name: /^Dividir saldo/ })
  if (await dividir.count()) await dividir.click()
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page.getByText(/Venta registrada correctamente/)).toBeVisible()

  // Nada nuevo en el navegador: localStorage, sessionStorage, cookies, cachés
  // ni IndexedDB (incluida la cola offline real, que la demo no debe tocar).
  const trasGuardados = await instantaneaNavegador(page)
  const nuevas = (previas, actuales) => actuales.filter((clave) => !previas.includes(clave))
  expect(nuevas(inicial.local, trasGuardados.local), 'localStorage').toEqual([])
  expect(nuevas(inicial.sesion, trasGuardados.sesion), 'sessionStorage').toEqual([])
  expect(nuevas(inicial.idb, trasGuardados.idb), 'IndexedDB').toEqual([])
  expect(trasGuardados.caches, 'Cache Storage').toEqual(inicial.caches)
  expect(trasGuardados.cookie, 'cookies').toBe(inicial.cookie)

  // La base real no cambió y la demo no emitió ninguna request.
  expect(await contarFilas()).toEqual(antes)
  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])

  // Al recargar vuelve el seed: mismos KPIs y los guardados desaparecen.
  await page.goto('/resumen')
  expect(await textoResumen(page)).toBe(resumenInicial)
  await page.goto('/configuracion/equipo')
  await expect(page.getByTestId('integrante-fila').filter({ hasText: `Cierre 201 ${marca}` })).toHaveCount(0)
  await page.goto('/plantillas')
  await expect(page.getByText(`Cierre 201 ${marca}`)).toHaveCount(0)
  await page.goto('/garantias')
  await expect(page.getByText(`Cliente cierre ${marca}`)).toHaveCount(0)
  await page.goto('/promociones')
  await expect(page.getByText(codigo)).toHaveCount(0)
  await page.goto('/pos')
  await expect(page.locator('#pos-resumen-venta').getByText('0 productos')).toBeVisible()

  // Salir limpia la marca de demo de la pestaña.
  await page.getByTestId('menu-acciones').click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  const trasSalir = await instantaneaNavegador(page)
  expect(trasSalir.sesion.filter((clave) => clave.startsWith('mobos:demo-session')), 'marca de demo').toEqual([])
  expect(nuevas(inicial.local, trasSalir.local), 'localStorage tras salir').toEqual([])
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

test('configuración en demo muestra avisos claros y sin cargas colgadas', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)

  // Sucursales y Precios explican que se administran con una cuenta real.
  await page.goto('/configuracion/sucursales')
  await expect(page.getByText('Las sucursales se administran con una cuenta real')).toBeVisible()
  await expect(page.getByText('Cargando sucursales…')).toHaveCount(0)
  await page.goto('/configuracion/precios')
  await expect(page.getByText('Las listas de precios se configuran con una cuenta real')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ingresar con mi cuenta' })).toBeVisible()

  // El interruptor de seguro tiene nombre accesible y no expone atributos raros.
  await page.goto('/configuracion/negocio')
  await expect(page.getByRole('switch', { name: 'Aplica seguro' })).toBeVisible()
})

test('el último usado es el default y se puede cambiar (#209)', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await cerrarGuia(page)

  const irADocumentacion = async () => {
    await page.getByRole('button', { name: 'Configuración', exact: true }).click()
    await page.locator('main').getByRole('button', { name: 'Sistema', exact: true }).click()
    await page.locator('main').getByRole('tab', { name: 'Documentación', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Documentación', exact: true })).toBeVisible()
  }

  await irADocumentacion()
  const filtroPOS = page.locator('main').getByRole('button', { name: 'POS', exact: true })
  await expect(page.locator('main').getByRole('button', { name: 'Todo', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Elegir POS se recuerda dentro de la sesión (navegación SPA).
  await filtroPOS.click()
  await expect(filtroPOS).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Resumen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Resumen general' })).toBeVisible()
  await irADocumentacion()
  await expect(filtroPOS).toHaveAttribute('aria-pressed', 'true')

  // En la demo, recargar descarta lo recordado y vuelve el default sensato.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Documentación', exact: true })).toBeVisible()
  await expect(page.locator('main').getByRole('button', { name: 'Todo', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
