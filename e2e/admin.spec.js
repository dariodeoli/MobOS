// Owner views (admin storageState): resumen KPIs, inventario unit intake,
// equipo → Vendedores roster + creation, and finanzas → Caja opening.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginAsSeller } from './helpers/login.js'

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
    await page.goto('/inventario/unidades')
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
    await page.evaluate(
      async ({ api, serial }) => {
        await fetch(`${api}/api/inventory-reservations`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'release', serials: [serial] }),
        })
      },
      { api: API, serial: SEED.products.iphone.imei },
    )
    await page.reload()

    const fila = () =>
      page.getByTestId('inventario-fila').filter({ hasText: SEED.products.iphone.imei }).first()
    await expect(fila()).toBeVisible()
    await fila().click()
    await page
      .getByRole('dialog', { name: /iPhone/ })
      .getByRole('button', { name: 'Reservar' })
      .click()
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
    await page.evaluate(
      async ({ api, serial }) => {
        await fetch(`${api}/api/inventory-reservations`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'release', serials: [serial] }),
        })
      },
      { api: API, serial: SEED.products.iphone.imei },
    )
    await page.reload()
    await expect(fila().getByText('Disponible')).toBeVisible()
  })

  test('equipo → Vendedores lists the seeded sellers', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
    for (const seller of SEED.sellers) {
      await expect(page.getByLabel(`Nombre de ${seller.name}`)).toBeVisible()
    }
  })

  // Fixed in the Phase-3 merge: the "Agregar directamente" form now creates
  // the seller via POST /api/users (including the 4-digit PIN). The PIN is
  // unique per run: the API rejects a PIN already in use by the company, and
  // the local E2E database persists users across runs.

  // Horario de acceso del integrante: se carga desde Configuración → Equipo y
  // el backend lo aplica al iniciar sesión. El test usa un rango permisivo
  // (todos los días, todo el día) para que, si algo falla, el vendedor
  // sembrado no quede bloqueado en la próxima corrida.
  test('equipo → el horario del vendedor se configura y se quita', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
    const vendedor = SEED.sellers[0].name
    const botonHorario = () => page.getByLabel(new RegExp(`^Horario de ${vendedor}`))

    await botonHorario().click()
    const modal = page
      .getByRole('dialog', { name: /Horario de acceso/ })
      .filter({ visible: true })
      .first()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '+ Rango' }).click()
    for (const dia of ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
      await modal.getByRole('button', { name: dia, exact: true }).click()
    await modal.getByLabel('Desde').fill('00:00')
    await modal.getByLabel('Hasta').fill('23:59')
    await modal.getByRole('button', { name: 'Guardar horario' }).click()
    await expect(page.getByText('Horario de acceso actualizado.')).toBeVisible()
    // El botón pasa a mostrar el resumen del horario cargado.
    await expect(botonHorario()).toBeVisible()

    // Se quita para dejar el acceso libre.
    await botonHorario().click()
    await modal.getByRole('button', { name: 'Quitar' }).click()
    await modal.getByRole('button', { name: 'Guardar horario' }).click()
    await expect(page.getByText('Horario quitado: el acceso queda libre.')).toBeVisible()
    await expect(page.getByLabel(`Horario de ${vendedor}`, { exact: true })).toBeVisible()
  })

  test('equipo → Vendedores creates a new seller with a PIN', async ({ page }) => {
    await page.goto('/configuracion/equipo')
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
    await page.goto('/configuracion/equipo')
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

  // Reservar eligiendo un cliente de la lista deja la reserva ligada a su ficha
  // (teléfono y RUC quedan disponibles en el perfil, sin crear fichas nuevas).
  test('inventario: la reserva con cliente queda ligada a su ficha', async ({ page }) => {
    await page.goto('/pos/inventario')
    const resultado = await page.evaluate(async api => {
      const clientes = await fetch(`${api}/api/customers?q=E2E`, { credentials: 'include' }).then(
        r => r.json(),
      )
      const cliente = clientes[0]
      const unidades = await fetch(`${api}/api/inventory-units`, { credentials: 'include' }).then(
        r => r.json(),
      )
      const libre = unidades.find(u => u.status === 'AVAILABLE')
      if (!cliente || !libre) return { error: 'sin datos' }
      const antes = clientes.length
      const respuesta = await fetch(`${api}/api/inventory-reservations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serials: [libre.serial], customerId: cliente.id, minutes: 60 }),
      })
      const reservadas = await respuesta.json()
      const despues = await fetch(`${api}/api/customers?q=E2E`, { credentials: 'include' }).then(
        r => r.json(),
      )
      await fetch(`${api}/api/inventory-reservations`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'release', serials: [libre.serial] }),
      })
      return {
        status: respuesta.status,
        ficha: reservadas?.[0]?.reservationCustomerRef?.id,
        esperado: cliente.id,
        antes,
        despues: despues.length,
      }
    }, API)
    expect(resultado.status).toBe(201)
    expect(resultado.ficha).toBe(resultado.esperado)
    // Reservar no crea fichas.
    expect(resultado.despues).toBe(resultado.antes)
  })

  test('códigos comerciales: cotización COT-#0001 y SKU legible sin timestamp', async ({
    page,
  }) => {
    await page.goto('/pos/inventario')
    const resultado = await page.evaluate(async api => {
      const post = async (path, data) => {
        const response = await fetch(`${api}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        })
        return { status: response.status, body: await response.json().catch(() => null) }
      }
      // Nombre con prefijo ZZ para que no colisione con textos de la interfaz
      // (los locators por texto son estrictos).
      const sufijo = Date.now().toString(36)
      const cotizacion = await post('/api/quotes', {
        customerName: `ZZ Cotizacion ${sufijo}`,
        items: [{ description: 'Equipo de prueba', quantity: 1, unitPricePyg: 1000000 }],
      })
      const producto = {
        name: `ZZ Prueba ${sufijo}`,
        pricePyg: 100000,
        stock: 0,
        category: 'Accesorios',
        sku: `ZZ-PRUEBA-${sufijo.toUpperCase()}`,
      }
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
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()

    const bateria = page.getByPlaceholder('Batería % (opcional)')
    await bateria.fill('95x')
    await expect(bateria).toHaveValue('95')
  })

  test('clientes → teléfono solo dígitos con +595 editable y límite de crédito en Gs', async ({
    page,
  }) => {
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
    await expect(
      page
        .getByText('Orden de servicio actualizada.')
        .or(page.getByText('Diagnóstico', { exact: true }).first()),
    ).toBeVisible()
  })

  // La cotización con un cliente existente queda ligada a su ficha, así la
  // conversión en pedido no pierde al cliente.
  test('cotizaciones: el cliente elegido queda ligado a su ficha', async ({ page }) => {
    await page.goto('/pos/cotizaciones')
    const resultado = await page.evaluate(async api => {
      const clientes = await fetch(`${api}/api/customers?q=E2E`, { credentials: 'include' }).then(
        r => r.json(),
      )
      const cliente = clientes[0]
      if (!cliente) return { error: 'sin clientes' }
      const respuesta = await fetch(`${api}/api/quotes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: cliente.id,
          customerName: cliente.name,
          items: [{ description: 'Equipo', quantity: 1, unitPricePyg: 500000 }],
        }),
      })
      const cotizacion = await respuesta.json()
      return {
        status: respuesta.status,
        customerId: cotizacion.customerId,
        esperado: cliente.id,
        nombre: cliente.name,
      }
    }, API)
    expect(resultado.status).toBe(201)
    expect(resultado.customerId).toBe(resultado.esperado)
  })

  // La auditoría real (antes solo existía en la demo).
  test('auditoría: lista los movimientos del negocio y filtra por área', async ({ page }) => {
    await page.goto('/configuracion/historial')
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible()
    const tabla = page.getByTestId('auditoria-tabla')
    await expect(tabla).toBeVisible()
    const filas = page.getByTestId('auditoria-fila')
    await expect(filas.first()).toBeVisible()

    await page.getByLabel('Filtrar por área').selectOption('InventoryUnit')
    await expect(filas.first()).toBeVisible()
    await expect(tabla).toContainText('Inventario')

    const { scrollWidth, clientWidth } = await tabla.evaluate(node => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }))
    expect(
      scrollWidth,
      'la tabla de auditoría no debe pedir scroll horizontal',
    ).toBeLessThanOrEqual(clientWidth + 1)
  })

  test('finanzas → Caja can open the cash session', async ({ page }) => {
    await page.goto('/finanzas/caja')
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

// Logo de la empresa: se sube como archivo, se ve la vista previa y se puede
// quitar. El comprobante lo incrusta como data URL al imprimir.
test('configuración → sube el logo de la empresa y lo quita', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.goto('/pos/equipo')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Logo de la empresa' })).toBeVisible()
  await expect(page.getByText('Sin logo')).toBeVisible()
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .first()
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Logo de la empresa')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).first().click()
  await expect(page.getByText('Sin logo')).toBeVisible()
})

// Búsqueda de pedidos: se resuelve en el servidor (número, cliente, RUC o
// vendedor), así encuentra pedidos fuera de la página cargada.
test('pedidos → la búsqueda llega al servidor y encuentra por número', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const consulta = page.waitForRequest(
    pedido =>
      pedido.method() === 'GET' &&
      pedido.url().includes('/api/orders') &&
      pedido.url().includes('q='),
  )
  const respuesta = page.waitForResponse(
    res => res.url().includes('/api/orders') && res.url().includes('q=') && res.status() === 200,
  )
  await page.getByLabel('Buscar pedidos').fill(SEED.seedOrderNumber)
  await consulta
  await respuesta
  await expect(page.getByText(SEED.seedOrderNumber).first()).toBeVisible()
})

// Foto del usuario: se sube desde Mi identidad y queda disponible para las
// cronologías (el avatar reemplaza a las iniciales).
test('configuración → sube mi foto y la quita', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.goto('/pos/equipo')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByText('Mi foto')).toBeVisible()
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .last()
    .setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Mi foto')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).last().click()
  await expect(page.getByAltText('Mi foto')).toHaveCount(0)
})

// Solicitudes comerciales: hay una sola bandeja (Stock y servicio →
// Autorizaciones). El vendedor pide desde la ficha del cliente y gerencia
// resuelve ahí; nadie puede resolver su propia solicitud, por eso la pide el
// vendedor en su propia sesión.
test('solicitudes → pedir mayorista desde la ficha y aprobarla en Autorizaciones', async ({
  page,
  browser,
}) => {
  // Cliente nuevo por corrida, con una venta en la sucursal del vendedor: el
  // perfil 360° solo muestra clientes con pedidos en su sucursal. Evita además
  // el bloqueo por solicitud duplicada y que ya esté en mayorista.
  const nombre = `Solicitud E2E ${Date.now()}`

  // Sin storage state: la sesión del proyecto es la de gerencia.
  const contextoVendedor = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const vendedor = await contextoVendedor.newPage()
  await vendedor.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await loginAsSeller(vendedor)
  const venta = await vendedor.evaluate(
    async ({ api, nombre, producto }) => {
      const res = await fetch(`${api}/api/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: `E2E-SOL-${Date.now()}`,
          customer: { name: nombre },
          items: [
            {
              productId: producto.id,
              description: producto.name,
              quantity: 1,
              unitPricePyg: producto.pricePyg,
            },
          ],
          payment: { method: 'CASH', amountPyg: producto.pricePyg },
        }),
      })
      return { status: res.status, detalle: res.ok ? '' : (await res.text()).slice(0, 200) }
    },
    { api: API, nombre, producto: SEED.products.cable },
  )
  expect(venta, 'el vendedor tiene que poder vender').toMatchObject({ status: 201 })

  await vendedor.goto('/pos/clientes')
  await vendedor.getByLabel('Buscar clientes').fill(nombre)
  await vendedor.getByTestId('cliente-fila').filter({ hasText: nombre }).first().click()
  await vendedor
    .getByRole('tab', { name: /^Comercial/ })
    .first()
    .click()
  await vendedor.getByRole('button', { name: 'Solicitar mayorista' }).click()
  await vendedor.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(vendedor.getByText('Solicitud enviada', { exact: false })).toBeVisible()
  await contextoVendedor.close()

  await page.goto('/pos/autorizaciones')
  await expect(page.getByRole('heading', { name: 'Autorizaciones comerciales' })).toBeVisible()
  const fila = page.getByTestId('autorizacion-fila').filter({ hasText: nombre }).first()
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: 'Aprobar' }).click()
  const aprobar = page.getByRole('dialog')
  await expect(aprobar.getByRole('heading', { name: 'Aprobar Mayorista' })).toBeVisible()
  await aprobar.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Solicitud aprobada', { exact: false })).toBeVisible()
  await expect(fila.getByText('Aprobada')).toBeVisible()

  // La bandeja es una sola: la tarjeta duplicada de Configuración se eliminó.
  await page.goto('/pos/equipo')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Solicitudes del cliente' })).toHaveCount(0)
  // Las plantillas ya no viven dentro de Configuración: tienen vista propia.
  await page.goto('/pos/plantillas')
  await expect(page.getByRole('heading', { name: 'Plantillas de WhatsApp' })).toBeVisible()
})
