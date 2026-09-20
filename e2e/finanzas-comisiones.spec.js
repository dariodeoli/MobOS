// Comisiones: las reglas viven en Finanzas → Comisiones y ya no en
// Configuración → Equipo; se pueden crear, editar y eliminar desde ahí (#56).
// La liquidación cierra el período con comprobante verificable por QR y se
// imprime por el puente falso, sin impresora real (#83).

import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { SEED } from './helpers/seed-data.js'
import { crearPuenteFalso, parearPuente } from './helpers/fake-bridge.mjs'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DESTINO_COMISIONES = 'lan:10.99.99.55:9100'
const NOMBRE_IMPRESORA_COMISIONES = 'Térmica comisiones E2E'

const bearer = (token) => ({ Authorization: `Bearer ${token}` })

function cookieValue(headersArray, name) {
  for (const header of headersArray) {
    if (header.name.toLowerCase() !== 'set-cookie') continue
    const match = String(header.value).match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    if (match) return match[1]
  }
  return ''
}

async function tokensDeAdmin() {
  const state = JSON.parse(await readFile('e2e/.auth/admin.json', 'utf8'))
  const buscar = (nombre) => state.cookies.find((cookie) => cookie.name === nombre)?.value || ''
  return { admin: buscar('mobos_seller_session'), company: buscar('mobos_company_session') }
}

test.describe('reglas de comisión en Finanzas', () => {
  test('Configuración ya no las muestra y Finanzas → Comisiones permite editarlas', async ({ page }) => {
    const nombre = `Integrante Comisiones ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    await page.goto('/configuracion/equipo')
    const creado = await page.evaluate(
      async ({ api, nombre, pin }) => {
        const response = await fetch(`${api}/api/users`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nombre, pin, role: 'VENDEDOR' }),
        })
        return response.json()
      },
      { api: API, nombre, pin },
    )
    expect(creado?.id).toBeTruthy()

    // Configuración → Equipo solo avisa dónde viven ahora.
    await expect(page.getByRole('heading', { name: 'Comisiones' })).toBeVisible()
    await expect(page.getByText(/Finanzas → Comisiones/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ir a Finanzas → Comisiones' }).click()
    await expect(page).toHaveURL(/\/finanzas\/comisiones$/)
    await expect(page.getByRole('heading', { name: 'Comisiones', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toBeVisible()

    // Crear una regla para el integrante dedicado (sin colisiones con seeds).
    const vendedorSelect = page.getByRole('combobox', { name: 'Vendedor de la regla' })
    await expect(vendedorSelect.locator(`option[value="${creado.id}"]`)).toHaveCount(1)
    await vendedorSelect.selectOption(creado.id)
    await page.getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('0,5')
    await page.getByRole('button', { name: 'Agregar regla' }).click()
    await expect(page.getByText('Regla de comisión creada.')).toBeVisible()
    const regla = () => page.getByTestId('regla-comision').filter({ hasText: nombre }).first()
    await expect(regla().getByText('0,5%')).toBeVisible()

    // Editar el porcentaje.
    await regla().getByTitle('Editar porcentaje').click()
    await regla().getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('1,5')
    await regla().getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Regla de comisión actualizada.')).toBeVisible()
    await expect(regla().getByText('1,5%')).toBeVisible()

    // Eliminar con confirmación.
    await regla().getByTitle('Eliminar regla').click()
    await page.getByRole('dialog', { name: '¿Eliminar regla?' }).getByRole('button', { name: 'Eliminar regla' }).click()
    await expect(page.getByText('Regla de comisión eliminada.')).toBeVisible()
    await expect(page.getByTestId('regla-comision').filter({ hasText: nombre })).toHaveCount(0)

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
  })
})

// Ciclo de la liquidación (#83): un vendedor con una venta del período, cierre
// desde Finanzas, comprobante con QR de la app, impresión por el puente falso
// y verificación pública sin sesión. Se usan tokens Bearer para preparar los
// datos (vendedor, regla y venta) y la UI solo para lo que se quiere cubrir.
test.describe('liquidación de comisiones con comprobante', () => {
  test('cerrar el período, imprimir por el puente falso y verificar el QR', async ({ page, request }) => {
    const { admin, company } = await tokensDeAdmin()
    expect(admin).toBeTruthy()
    expect(company).toBeTruthy()

    // Puente falso: se revocan los de corridas anteriores (tope de 20) y se
    // parea el nuevo; la UI de puentes ya está cubierta por impresion-remota.
    const puentes = await request.get(`${API}/api/print/bridges`, { headers: bearer(admin) })
    for (const puente of (await puentes.json()).bridges || []) {
      if (/^Puente comisiones E2E/.test(puente.name || '')) await request.delete(`${API}/api/print/bridges/${puente.id}`, { headers: bearer(admin) })
    }
    const creadoPuente = await request.post(`${API}/api/print/bridges`, { headers: bearer(admin), data: { name: `Puente comisiones E2E ${Date.now()}` } })
    expect(creadoPuente.status()).toBe(201)
    const { pairingCode } = await creadoPuente.json()
    const { token: tokenPuente, bridgeId } = await parearPuente({ api: API, code: pairingCode })
    const puenteFalso = crearPuenteFalso({ api: API, token: tokenPuente })
    puenteFalso.iniciar()
    let vendedorId = ''
    try {
      // Impresora predeterminada asignada al puente (idempotente entre corridas).
      const impresoras = await request.get(`${API}/api/print/printers`, { headers: bearer(admin) })
      const existente = ((await impresoras.json()).printers || []).find((impresora) => impresora.destination === DESTINO_COMISIONES)
      if (existente) {
        const actualizada = await request.patch(`${API}/api/print/printers/${existente.id}`, { headers: bearer(admin), data: { bridgeId, isDefault: true } })
        expect(actualizada.status()).toBe(200)
      } else {
        const nueva = await request.post(`${API}/api/print/printers`, {
          headers: bearer(admin),
          data: { name: NOMBRE_IMPRESORA_COMISIONES, brand: 'E2E', model: 'Puente', location: SEED.branchName, connection: 'lan', destination: DESTINO_COMISIONES, width: 80, copies: 1, cut: true, density: 3, characters: true, isDefault: true, isActive: true, bridgeId },
        })
        expect(nueva.status()).toBe(201)
      }

      // Vendedor dedicado (PIN único por corrida), regla y una venta del período.
      const marca = Date.now().toString(36)
      const vendedorNombre = `Vendedor Comisiones ${marca}`
      let pinUsado = ''
      let vendedor = null
      for (let intento = 0; intento < 5 && !vendedor; intento += 1) {
        pinUsado = String(1000 + Math.floor(Math.random() * 9000))
        // En la sucursal del seed: la venta exige que el producto sea de la
        // sucursal del vendedor.
        const respuesta = await request.post(`${API}/api/users`, { headers: bearer(admin), data: { name: vendedorNombre, pin: pinUsado, role: 'VENDEDOR', branchId: SEED.branchId } })
        if (respuesta.status() === 201) vendedor = await respuesta.json()
      }
      expect(vendedor?.id, 'no se pudo crear el vendedor de la liquidación').toBeTruthy()
      vendedorId = vendedor.id

      const productos = await request.get(`${API}/api/products`, { headers: bearer(admin) })
      const cable = ((await productos.json()) || []).find((producto) => producto.sku === SEED.products.cable.sku)
      expect(cable?.id, 'falta el producto E2E-CABLE del seed').toBeTruthy()

      const pin = await request.post(`${API}/api/auth/pin`, { headers: bearer(company), data: { sellerId: vendedor.id, pin: pinUsado } })
      expect(pin.status()).toBe(200)
      const vendedorToken = cookieValue(await pin.headersArray(), 'mobos_seller_session')
      expect(vendedorToken).toBeTruthy()

      const venta = await request.post(`${API}/api/orders`, {
        headers: bearer(vendedorToken),
        data: {
          orderNumber: `E2E-COM-${marca}`,
          items: [{ productId: cable.id, description: cable.name, quantity: 1, unitPricePyg: cable.pricePyg }],
          payment: { method: 'CASH', amountPyg: cable.pricePyg },
        },
      })
      expect(venta.status(), await venta.text()).toBe(201)

      const regla = await request.post(`${API}/api/commission-rules`, { headers: bearer(admin), data: { userId: vendedor.id, percentPyg: 10 } })
      expect(regla.status(), await regla.text()).toBe(201)

      // Cerrar el período desde la UI: margen 25.000 (costo 20.000) al 10% = 2.500.
      await page.goto('/finanzas/comisiones')
      const selector = page.getByRole('combobox', { name: 'Vendedor de la liquidación' })
      await expect(selector.locator(`option[value="${vendedor.id}"]`)).toHaveCount(1)
      await selector.selectOption(vendedor.id)
      await page.getByRole('button', { name: 'Cerrar liquidación' }).click()

      const modal = page.getByRole('dialog', { name: `Comprobante · ${vendedorNombre}` })
      await expect(modal).toBeVisible()
      await expect(modal.getByText('Gs 2.500')).toBeVisible()

      // El QR es una URL de la app: la página pública verifica sin sesión.
      const enlace = (await modal.locator('p.break-all').innerText()).trim()
      expect(enlace).toMatch(/\/liquidacion\/[^/]+$/)
      await page.goto(enlace)
      await expect(page.getByRole('heading', { name: vendedorNombre })).toBeVisible()
      await expect(page.getByText('Comprobante verificado')).toBeVisible()
      await expect(page.getByText('Gs 2.500')).toBeVisible()
      await expect(page.getByText('Documento no fiscal. No válido como factura.')).toBeVisible()

      // Impresión: sin agente local (se corta 127.0.0.1), la liquidación sale
      // por el puente falso y queda en la cola remota con su tipo.
      await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
      await page.goto('/finanzas/comisiones')
      const fila = page.getByTestId('liquidacion-comision').filter({ hasText: vendedorNombre }).first()
      await expect(fila).toBeVisible()
      await fila.getByTitle('Imprimir comprobante').click()

      const trabajo = await puenteFalso.esperarTrabajo((item) => item.destination === DESTINO_COMISIONES)
      const detalle = await request.get(`${API}/api/print/jobs/${trabajo.id}`, { headers: bearer(admin) })
      const job = (await detalle.json()).job
      expect(job.kind).toBe('liquidacion-comision')
      expect(job.path).toBe('REMOTO')
      expect(job.state).toBe('ACEPTADO')
    } finally {
      puenteFalso.detener()
      // Limpieza: el vendedor dedicado queda inactivo (su liquidación persiste).
      if (vendedorId) await request.patch(`${API}/api/users`, { headers: bearer(admin), data: { id: vendedorId, status: 'INACTIVE' } })
    }
  })
})
