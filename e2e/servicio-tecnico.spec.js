// Servicio técnico (#122): alta con costos desglosados (repuesto + mano de obra
// + otros), catálogo con buscador, checklist configurable por tipo de equipo y
// avance por el pipeline. La orden de prueba se cancela al final.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-240-taller-cliente'

test('la orden se carga con costos desglosados y la utilidad se calcula sola', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = `Cliente Taller ${marca}`
  await page.goto('/servicio')
  await expect(page.getByRole('button', { name: '+ Nueva orden' })).toBeVisible()

  // El catálogo puede estar vacío: se carga el sugerido desde el propio panel.
  if (await page.getByRole('button', { name: 'Cargar catálogo sugerido' }).first().isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Cargar catálogo sugerido' }).first().click()
  }

  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await modal.getByLabel('Cliente', { exact: true }).fill(cliente)
  await modal.getByLabel('Dispositivo', { exact: true }).fill(`iPhone 14 Pro ${marca}`)
  // Buscador instantáneo del catálogo: solo quedan los servicios que coinciden.
  await modal.getByLabel('Buscar servicio', { exact: true }).fill('display')
  const selector = modal.getByLabel('Servicio del catálogo', { exact: true })
  const opcion = selector.locator('option', { hasText: /display/i }).first()
  await expect(opcion).toBeAttached()
  await selector.selectOption(await opcion.getAttribute('value'))
  await modal.getByLabel('Precio cobrado', { exact: true }).fill('300.000')
  await modal.getByLabel('Repuesto (Gs)', { exact: true }).fill('120.000')
  await modal.getByLabel('Mano de obra (Gs)', { exact: true }).fill('60.000')
  await modal.getByLabel('Otros (Gs)', { exact: true }).fill('20.000')
  // El panel calcula costo del trabajo y utilidad en vivo.
  await expect(modal.getByText('Gs 200.000')).toBeVisible()
  await expect(modal.getByText('Gs 100.000')).toBeVisible()
  await modal.getByRole('button', { name: 'Crear orden' }).click()
  await expect(page.getByText('Orden de servicio creada.')).toBeVisible({ timeout: 15_000 })

  // La fila muestra la utilidad real (300.000 − 200.000).
  const fila = page.getByTestId('servicio-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()
  await expect(fila.getByText('+Gs 100.000')).toBeVisible()

  // Avance del pipeline: Recibido → Diagnóstico.
  await fila.getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  await expect(page.getByTestId('servicio-fila').filter({ hasText: marca }).first().getByText('Diagnóstico', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Limpieza: la orden de prueba queda cancelada.
  await page.evaluate(async ({ api, cliente }) => {
    const ordenes = await fetch(`${api}/api/service-orders`, { credentials: 'include' }).then(respuesta => respuesta.json())
    const orden = (Array.isArray(ordenes) ? ordenes : []).find(item => item.customerName === cliente)
    if (orden) await fetch(`${api}/api/service-orders`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orden.id, status: 'CANCELADO' }) })
  }, { api: API, cliente })
})

test('el checklist se configura por tipo de dispositivo', async ({ page }) => {
  const punto = 'Face ID E2E'
  await page.goto('/servicio')
  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await modal.getByRole('button', { name: 'Configurar' }).click()
  const config = page.getByRole('dialog', { name: /^Checklist de recepción ·/ })
  await config.getByLabel('Nuevo punto del checklist', { exact: true }).fill(punto)
  await config.getByRole('button', { name: 'Agregar' }).click()
  await expect(config.getByTestId('checklist-puntos').getByText(punto)).toBeVisible({ timeout: 15_000 })
  // Cerrar la configuración deja el formulario abierto con el punto nuevo.
  await config.getByRole('button', { name: 'Cerrar' }).click()
  await expect(config).toHaveCount(0)
  await expect(modal.getByText(punto)).toBeVisible({ timeout: 15_000 })
})

// WhatsApp central (#134): el menú reutilizable sugiere la plantilla del estado
// del pipeline con las variables del taller ya resueltas.
test('el WhatsApp de la orden usa la plantilla del estado con sus variables', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = `Cliente WA ${marca}`
  await page.goto('/servicio')
  const datos = await page.evaluate(async ({ api, cliente, marca }) => {
    const clienteCreado = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cliente, phone: '0981222333', countryCode: '+595' }),
    }).then((respuesta) => respuesta.json())
    const orden = await fetch(`${api}/api/service-orders`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: clienteCreado.id, customerName: cliente, device: `iPhone 13 ${marca}`, serial: `WA-${marca}`, serviceName: 'Cambio de batería', reportedIssue: 'No enciende', pricePyg: 250000 }),
    }).then((respuesta) => respuesta.json())
    return { ordenId: orden.id }
  }, { api: API, cliente, marca })
  expect(datos.ordenId, 'la orden de servicio debe crearse').toBeTruthy()
  await page.reload()

  const fila = () => page.getByTestId('servicio-fila').filter({ hasText: marca }).first()
  await expect(fila()).toBeVisible()
  const abrirMenu = () => fila().getByRole('button', { name: new RegExp(`Elegir plantilla de WhatsApp para ${cliente}`) }).click()

  // Recibido: la sugerida es "Equipo recibido" y el mensaje trae el equipo real.
  await abrirMenu()
  const menu = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await expect(menu.getByText('Sugerida')).toBeVisible()
  await expect(menu.getByLabel('Mensaje de WhatsApp')).toHaveValue(new RegExp(`Recibimos tu iPhone 13 ${marca}`))
  await page.keyboard.press('Escape')

  // Diagnóstico: la sugerencia cambia con el estado de la orden.
  await page.evaluate(async ({ api, ordenId }) => {
    await fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ordenId, status: 'DIAGNOSTICO', diagnosis: 'Batería agotada' }),
    })
  }, { api: API, ordenId: datos.ordenId })
  await page.reload()
  await abrirMenu()
  await expect(menu.getByLabel('Mensaje de WhatsApp')).toHaveValue(/diagnóstico de tu iPhone 13/i)
  await page.keyboard.press('Escape')

  // Listo para retirar: la plantilla de retiro también viaja con el equipo.
  await page.evaluate(async ({ api, ordenId }) => {
    await fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ordenId, status: 'LISTO' }),
    })
  }, { api: API, ordenId: datos.ordenId })
  await page.reload()
  await abrirMenu()
  await expect(menu.getByLabel('Mensaje de WhatsApp')).toHaveValue(/listo para retirar/i)
  await page.keyboard.press('Escape')

  // Limpieza determinista: la orden de prueba queda cancelada.
  await page.evaluate(async ({ api, ordenId }) => {
    await fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ordenId, status: 'CANCELADO' }),
    })
  }, { api: API, ordenId: datos.ordenId })
})

// #240 §4 — del taller al cliente: la ficha muestra la orden de servicio, la
// cronología el ingreso y los cambios de estado, y el portal el estado con sus
// fechas (sin costos ni datos internos).
test('el cliente ve su equipo en el taller: ficha, cronología y portal', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  await page.goto('/clientes')
  const datos = await page.evaluate(async ({ api, marca }) => {
    const cliente = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Cliente Taller Portal ${marca}`, firstName: 'Taller', phone: `0981${String(Date.now()).slice(-6)}` }),
    }).then((respuesta) => respuesta.json())
    const orden = await fetch(`${api}/api/service-orders`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: cliente.id, customerName: cliente.name, device: `iPhone 12 · 128 GB ${marca}`, serial: `TP-${marca}`, serviceName: 'Cambio de batería', reportedIssue: 'Batería dura poco', pricePyg: 450000, costPyg: 180000 }),
    }).then((respuesta) => respuesta.json())
    await fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orden.id, status: 'LISTO' }),
    })
    return { clienteId: cliente.id, ordenId: orden.id, serviceNumber: orden.serviceNumber }
  }, { api: API, marca })
  expect(datos.clienteId, JSON.stringify(datos)).toBeTruthy()

  // Ficha → Pedidos: bloque Servicio técnico con el estado del taller.
  await page.goto(`/clientes?cliente=${encodeURIComponent(datos.clienteId)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  const fila = ficha.getByTestId('perfil-servicio-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible({ timeout: 15000 })
  await expect(fila.getByText('Cambio de batería')).toBeVisible()
  await expect(fila.getByText('Listo para retirar')).toBeVisible()
  await fila.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SALIDA}/01-ficha-servicio.png` })

  // Cronología: ingreso y recorrido del estado en lenguaje de cliente.
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText('Equipo en taller').first()).toBeVisible({ timeout: 15000 })
  const cambio = ficha.getByText('Estado del taller').first()
  await expect(cambio).toBeVisible()
  await expect(ficha.getByText(/Recibido → Listo para retirar/).first()).toBeVisible()
  await cambio.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SALIDA}/02-cronologia-taller.png` })

  // Portal del cliente: estado y fechas del equipo en el taller.
  await ficha.getByRole('button', { name: /Portal del cliente/ }).click()
  await page.getByAltText('QR del portal del cliente').waitFor({ timeout: 15000 })
  const enlace = await page.locator('p.break-all').textContent()
  await page.goto(enlace.trim())
  await expect(page.getByText('Servicio técnico')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Listo para retirar').first()).toBeVisible()
  await expect(page.getByText(new RegExp(`iPhone 12 · 128 GB ${marca}`)).first()).toBeVisible()
  await expect(page.getByText(new RegExp(datos.serviceNumber)).first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-portal-servicio.png`, fullPage: true })

  // Limpieza: la orden de prueba queda cancelada.
  await page.evaluate(async ({ api, ordenId }) => {
    await fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ordenId, status: 'CANCELADO' }),
    })
  }, { api: API, ordenId: datos.ordenId })
})
