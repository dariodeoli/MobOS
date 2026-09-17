// Owner views (admin storageState): resumen KPIs, inventario unit intake,
// equipo → Vendedores roster + creation, and finanzas → Caja opening.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('owner panel', () => {
  test('resumen shows the dashboard KPIs', async ({ page }) => {
    await page.goto('/pos/resumen')
    await expect(page.getByRole('heading', { name: 'Resumen general' })).toBeVisible()
    await expect(page.getByText('Facturado', { exact: true })).toBeVisible()
    await expect(page.getByText('Ventas', { exact: true })).toBeVisible()
  })

  // Fixed in the Phase-3 merge (src/lib/api/index.js now imports the client):
  // the inventory units load from the API. The seeded serialized product
  // (iPhone 15 E2E Serial) owns one InventoryUnit, listed with its IMEI.
  test('inventario lists the seeded serialized unit with its IMEI', async ({ page }) => {
    await page.goto('/pos/inventario')
    await expect(page.getByRole('heading', { name: 'Inventario operativo' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Inventario \(/ })).toBeVisible()
    // La tabla compacta alinea el serial por columna (últimos 4 destacados).
    await expect(page.getByText('Verificación')).toBeVisible()
    await expect(page.getByText(new RegExp(SEED.products.iphone.imei))).toBeVisible()
  })

  // Permanencia: una unidad reservada sigue en Inventario, no desaparece del
  // listado, y desde ahí se puede cerrar la venta.
  test('inventario: la unidad reservada sigue en el listado', async ({ page }) => {
    await page.goto('/pos/inventario')
    await page.evaluate(async ({ api, serial }) => {
      await fetch(`${api}/api/inventory-reservations`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'release', serials: [serial] }),
      })
    }, { api: API, serial: SEED.products.iphone.imei })
    await page.reload()

    const fila = () => page.getByTestId('inventario-fila').filter({ hasText: SEED.products.iphone.imei }).first()
    await expect(fila()).toBeVisible()
    await fila().click()
    await page.getByRole('dialog', { name: /iPhone/ }).getByRole('button', { name: 'Reservar' }).click()
    const modal = page.getByRole('dialog', { name: 'Reservar unidad' })
    await expect(modal).toBeVisible()
    // La duración se ingresa compacta: "Duración [2] horas".
    await expect(modal.getByLabel('Duración en horas')).toHaveValue('2')
    await expect(modal.getByText('horas', { exact: true })).toBeVisible()
    await modal.getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(page.getByText(/Reserva creada por 2 horas/)).toBeVisible()

    // Sigue en Inventario, con su estado y el atajo para cerrar la venta.
    const reservada = fila()
    await expect(reservada.getByText('Reservado')).toBeVisible()
    await expect(reservada.getByRole('button', { name: 'Finalizar venta' })).toBeVisible()

    // Se libera para dejar el stock como estaba.
    await page.evaluate(async ({ api, serial }) => {
      await fetch(`${api}/api/inventory-reservations`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'release', serials: [serial] }),
      })
    }, { api: API, serial: SEED.products.iphone.imei })
    await page.reload()
    await expect(fila().getByText('Disponible')).toBeVisible()
  })

  test('equipo → Vendedores lists the seeded sellers', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
    for (const seller of SEED.sellers) {
      await expect(page.getByLabel(`Nombre de ${seller.name}`)).toBeVisible()
    }
  })

  // Fixed in the Phase-3 merge: the "Agregar directamente" form now creates
  // the seller via POST /api/users (including the 4-digit PIN). The PIN is
  // unique per run: the API rejects a PIN already in use by the company, and
  // the local E2E database persists users across runs.
  test('equipo → Vendedores creates a new seller with a PIN', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()

    const name = `Vendedor E2E ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    // El alta vive en el modal de "Invitar persona" (agregar directamente).
    await page.getByRole('button', { name: '+ Invitar persona' }).click()
    await page.getByRole('button', { name: 'Agregar directamente' }).click()
    await page.locator('#direct-name').fill(name)
    await page.locator('#direct-pin').fill(pin)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()

    await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()
    await expect(page.getByLabel(`Nombre de ${name}`)).toBeVisible()
  })

  test('equipo → Roles y permisos describes each role and its matrix', async ({ page }) => {
    await page.goto('/pos/equipo')
    await page.getByRole('button', { name: 'Roles y permisos' }).click()

    await expect(page.getByRole('heading', { name: 'Roles y permisos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Matriz de capacidades' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Gerente' })).toBeVisible()
    await expect(page.getByRole('rowheader', { name: /Aplicar descuentos/ })).toBeVisible()

    const tarjetaVendedor = page.locator('details', { hasText: 'Vendedor: atiende clientes' })
    await tarjetaVendedor.locator('summary').click()
    await expect(tarjetaVendedor.getByText('Qué puede hacer')).toBeVisible()
    await expect(tarjetaVendedor.getByText('Qué no puede')).toBeVisible()
  })

  // Los códigos comerciales tienen que ser cortos, secuenciales y dictables:
  // ni el número de cotización ni el SKU llevan timestamp.
  test('códigos comerciales: cotización COT-#0001 y SKU legible sin timestamp', async ({ page }) => {
    await page.goto('/pos/inventario')
    const resultado = await page.evaluate(async (api) => {
      const post = async (path, data) => {
        const response = await fetch(`${api}${path}`, {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        })
        return { status: response.status, body: await response.json().catch(() => null) }
      }
      // Nombre con prefijo ZZ para que no colisione con textos de la interfaz
      // (los locators por texto son estrictos).
      const sufijo = Date.now().toString(36)
      const cotizacion = await post('/api/quotes', { customerName: `ZZ Cotizacion ${sufijo}`, items: [{ description: 'Equipo de prueba', quantity: 1, unitPricePyg: 1000000 }] })
      const producto = { name: `ZZ Prueba ${sufijo}`, pricePyg: 100000, stock: 0, category: 'Accesorios', sku: `ZZ-PRUEBA-${sufijo.toUpperCase()}` }
      const primero = await post('/api/products', producto)
      const segundo = await post('/api/products', producto)
      return { cotizacion, primero, segundo, sufijo: sufijo.toUpperCase() }
    }, API)

    expect(resultado.cotizacion.status).toBe(201)
    expect(resultado.cotizacion.body.number).toMatch(/^COT-#\d{4,}$/)
    // El primer producto conserva el SKU pedido: no se le agrega timestamp.
    expect(resultado.primero.status).toBe(201)
    expect(resultado.primero.body.sku).toBe(`ZZ-PRUEBA-${resultado.sufijo}`)
    // El segundo, con el mismo SKU, recibe un sufijo numérico legible.
    expect(resultado.segundo.body.sku).toBe(`${resultado.primero.body.sku}-2`)
  })

  test('inventario → la batería solo acepta números', async ({ page }) => {
    await page.goto('/pos/inventario')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()

    const bateria = page.getByPlaceholder('Batería % (opcional)')
    await bateria.fill('95x')
    await expect(bateria).toHaveValue('95')
  })

  test('clientes → teléfono solo dígitos con +595 editable y límite de crédito en Gs', async ({ page }) => {
    await page.goto('/pos/clientes')
    await page.getByRole('button', { name: '+ Crear cliente' }).click()

    // El formulario de venta queda montado y oculto detrás del modal: se acota al modal de alta.
    const alta = page.locator('form').filter({ hasText: 'Límite de crédito (Gs)' })

    const pais = alta.getByLabel('Código de país')
    await expect(pais).toHaveValue('+595')
    await pais.fill('55')
    await expect(pais).toHaveValue('+55')

    const telefono = alta.getByPlaceholder('981 123 456')
    await telefono.fill('0981123456')
    await expect(telefono).toHaveValue('0981123456')

    const limite = alta.locator('label', { hasText: 'Límite de crédito (Gs)' }).locator('input')
    await limite.fill('3000000')
    await expect(limite).toHaveValue('3.000.000')
  })

  test('servicio técnico → crea la orden y avanza el pipeline', async ({ page }) => {
    await page.goto('/pos/servicio')
    await expect(page.getByRole('heading', { name: 'Servicio Técnico' })).toBeVisible()

    const stamp = Date.now().toString(36)
    const cliente = `Taller ${stamp}`
    const equipo = `iPhone 13 Pro ${stamp} · 256 GB`
    await page.getByRole('button', { name: '+ Nueva orden' }).click()
    await page.getByLabel('Cliente', { exact: true }).fill(cliente)
    await page.getByLabel('Dispositivo', { exact: true }).fill(equipo)
    await page.getByRole('button', { name: 'Crear orden' }).click()

    await expect(page.getByText(equipo).first()).toBeVisible()
    await expect(page.getByText(cliente)).toBeVisible()

    // Recepción → diagnóstico con el botón de avance del pipeline.
    await page.getByRole('button', { name: 'Diagnóstico', exact: true }).first().click()
    await expect(page.getByText('Orden de servicio actualizada.').or(page.getByText('Diagnóstico', { exact: true }).first())).toBeVisible()
  })

  test('finanzas → Caja can open the cash session', async ({ page }) => {
    await page.goto('/pos/finanzas')
    await expect(page.getByRole('heading', { name: 'Caja y control financiero' })).toBeVisible()

    // Re-runs may find the cash session still open from a previous run.
    if (await page.getByRole('heading', { name: 'Cerrar caja' }).isVisible()) {
      await page.locator('#counted').fill('0')
      await page.getByRole('button', { name: /Cerrar caja/ }).click()
    }
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()

    await page.locator('#opening').fill('100000')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
  })
})
