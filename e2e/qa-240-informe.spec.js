// #240 ítem 3 (acceso CRM/portal) — Informe de dispositivo: link público por
// serial + WhatsApp desde la ficha del cliente, y el enlace en su cuenta.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const API = SEED.api
const SALIDA = 'docs/QA-240-informe-dispositivo'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('informe del equipo: link público y WhatsApp desde la ficha, y en la cuenta', async ({ page, context }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const nombre = `Informe QA ${marca}`
  const serial = `356789${String(Date.now()).slice(-9)}`

  const alta = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Informe', secondName: `QA ${marca}`, phone: `0981${String(Date.now()).slice(-6)}`, countryCode: '+595' }),
  })
  expect([200, 201], JSON.stringify(alta.body)).toContain(alta.status)
  const productos = await api(page, '/api/products')
  const lista = Array.isArray(productos.body) ? productos.body : productos.body?.rows || []
  const producto = lista.find((row) => row.stock > 0) || lista[0]
  // El equipo tiene que existir como unidad en stock para poder venderse con
  // serial (la sesión administrativa opera sobre su sucursal).
  const sucursales = await api(page, '/api/branches')
  const listaSucursales = Array.isArray(sucursales.body) ? sucursales.body : sucursales.body?.rows || []
  const sucursal = listaSucursales[0]?.id
  const unidad = await api(page, '/api/inventory-units', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.id, serial, condition: 'USED', batteryHealth: 89, notes: 'Ingreso QA informe', ...(sucursal ? { branchId: sucursal } : {}) }),
  })
  expect([200, 201], JSON.stringify(unidad.body)).toContain(unidad.status)
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA240-${marca}`,
      customerId: alta.body.id,
      items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: 500000, inventoryUnitSerials: [serial] }],
      payment: { method: 'CASH', amountPyg: 500000 },
    }),
  })
  expect([200, 201], JSON.stringify(pedido.body)).toContain(pedido.status)

  // Ficha → dispositivos: el informe abre el link público en otra pestaña.
  await page.goto(`/clientes?cliente=${encodeURIComponent(alta.body.id)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  const fila = ficha.getByTestId('perfil-dispositivo-fila').filter({ hasText: serial.slice(-6) }).first()
  await expect(fila).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: `${SALIDA}/01-ficha-informe-acciones.png` })

  const [informe] = await Promise.all([
    context.waitForEvent('page'),
    fila.getByRole('button', { name: `Ver informe del equipo ${serial}` }).click(),
  ])
  await informe.waitForLoadState('domcontentloaded')
  await expect(informe.getByText('Informe de dispositivo')).toBeVisible({ timeout: 20000 })
  await expect(informe.getByText(producto.name || producto.nombre).first()).toBeVisible()
  await expect(informe.getByText(new RegExp(`${serial.slice(0, 4)}…${serial.slice(-3)}`)).first()).toBeVisible()
  await expect(informe.getByText(new RegExp(`QA240-${marca}`)).first()).toBeVisible()
  await expect(informe.getByText(/No es un certificado oficial/)).toBeVisible()
  await informe.screenshot({ path: `${SALIDA}/02-informe-publico.png`, fullPage: true })
  await informe.close()

  // WhatsApp: el mensaje lleva el link del informe (seguimos en Pedidos, donde
  // viven las acciones del dispositivo).
  const telefono = (await ficha.innerText()).match(/\d{3} \d{3} \d{3}/)
  expect(telefono, 'la ficha muestra el teléfono del cliente').toBeTruthy()
  const [wa] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: `Compartir informe del equipo ${serial} por WhatsApp` }).click(),
  ])
  const url = wa.url()
  await wa.close()
  expect(/wa\.me|api\.whatsapp\.com/.test(url), url).toBe(true)
  expect(decodeURIComponent(url)).toContain(`/u/${serial}`)

  // El envío queda registrado en la cronología del cliente (#240).
  const registro = await api(page, `/api/customers/${encodeURIComponent(alta.body.id)}/device-report`, {
    method: 'POST',
    body: JSON.stringify({ serial, model: producto.name || producto.nombre, canal: 'WHATSAPP' }),
  })
  expect(registro.status, `registro del envío: ${JSON.stringify(registro.body)}`).toBe(200)
  const linea = await api(page, `/api/customers/${encodeURIComponent(alta.body.id)}/timeline?limit=20`)
  expect(JSON.stringify(linea.body), `timeline: ${JSON.stringify(linea.body).slice(0, 400)}`).toContain('Informe del equipo compartido')
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText('Informe del equipo compartido').first()).toBeVisible({ timeout: 15000 })
  await expect(ficha.getByText(/por WhatsApp · serial/i).first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-cronologia-informe-compartido.png` })

  // Cuenta del cliente: la sección de informes enlaza el mismo informe.
  await ficha.getByRole('button', { name: /Portal del cliente/ }).click()
  await page.getByAltText('QR del portal del cliente').waitFor({ timeout: 15000 })
  const enlace = await page.locator('p.break-all').textContent()
  await page.goto(enlace.trim())
  await expect(page.getByText('Informes de tus equipos')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: `${SALIDA}/03-cuenta-informes.png`, fullPage: true })
})

test('demo: el informe del equipo también funciona con datos del navegador', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await contexto.newPage()
  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await page.goto('/clientes?cliente=demo-cliente-lucia')
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  const fila = ficha.getByTestId('perfil-dispositivo-fila').first()
  await expect(fila).toBeVisible({ timeout: 15000 })
  await fila.getByRole('button', { name: /Ver informe del equipo/ }).click()
  await expect(page.getByText('Informe de dispositivo')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/iPhone 15/).first()).toBeVisible()
  await expect(page.getByText('Aurora Móviles')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/05-informe-demo.png`, fullPage: true })

  // Compartir por correo en demo: queda en la cronología del navegador.
  await page.goto('/clientes?cliente=demo-cliente-lucia')
  const fichaDemo = page.getByRole('dialog')
  await fichaDemo.getByRole('tab', { name: /^Pedidos/ }).click()
  const filaDemo = fichaDemo.getByTestId('perfil-dispositivo-fila').first()
  await filaDemo.getByRole('button', { name: /Enviar informe del equipo .* por correo/ }).click()
  await expect(page.getByText('Informe enviado').first()).toBeVisible({ timeout: 15000 })
  await fichaDemo.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(fichaDemo.getByText('Informe del equipo compartido').first()).toBeVisible()
  await expect(fichaDemo.getByText(/por correo · serial/i).first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/06-demo-cronologia-informe.png` })
  await contexto.close()
})
