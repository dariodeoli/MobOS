// Owner views (admin storageState): resumen KPIs, inventario unit intake,
// equipo → Vendedores roster + creation, and finanzas → Caja opening.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginAsSeller } from './helpers/login.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('owner panel', () => {
  test('resumen shows the dashboard KPIs', async ({ page }) => {
    await page.goto('/resumen')
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
    await page.goto('/inventario')
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
    await page.getByRole('tab', { name: 'Roles y permisos' }).click()

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
    await page.goto('/inventario')
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
    await page.goto('/inventario')
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
    await page.goto('/clientes')
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
    await page.goto('/servicio')
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
    await page.goto('/cotizaciones')
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

  // #59/#61: la búsqueda cruza el metadato (un nombre de impresora que solo
  // vive en metadata) y hay filtros de actor y de rango de fechas.
  test('auditoría: busca en el metadato y filtra por actor y período', async ({ page }) => {
    await page.goto('/configuracion/historial')
    // Impresora propia de la prueba (idempotente por destino) y trabajo espejo
    // cuya auditoría guarda el nombre de la impresora solo en `metadata`.
    const nombreImpresora = `Térmica auditoría E2E ${Date.now()}`
    const destino = 'lan:10.99.99.50:9100'
    const creado = await page.evaluate(
      async ({ api, nombre, destino }) => {
        const lista = await fetch(`${api}/api/print/printers`, { credentials: 'include' })
        const { printers = [] } = await lista.json().catch(() => ({}))
        let impresora = printers.find((item) => item.destination === destino)
        if (!impresora) {
          const creada = await fetch(`${api}/api/print/printers`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: nombre, destination: destino, isActive: true }),
          })
          impresora = await creada.json()
        }
        const job = await fetch(`${api}/api/print/jobs`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: 'LOCAL', destination: destino, printerId: impresora.id, sourceJobId: `e2e-audit-${Date.now()}`, state: 'ACEPTADO' }),
        })
        // La base e2e se reutiliza: la impresora puede venir de una corrida
        // anterior, así que la búsqueda usa su nombre real y no el nuevo.
        return { jobId: (await job.json())?.job?.id || '', printerName: impresora.name }
      },
      { api: API, nombre: nombreImpresora, destino },
    )
    expect(creado.jobId).not.toBe('')

    // Un valor que solo existe en el metadato tiene que encontrar la fila.
    await page.getByLabel('Buscar en la auditoría').fill(creado.printerName)
    await page.getByRole('button', { name: 'Actualizar' }).click()
    const fila = page.getByTestId('auditoria-fila').filter({ hasText: 'Trabajo en cola' }).first()
    await expect(fila).toBeVisible({ timeout: 20_000 })

    // Filtros nuevos: por actor y por período no rompen el listado.
    await page.getByLabel('Buscar en la auditoría').fill('')
    await page.getByLabel('Filtrar por actor').selectOption({ label: 'Administrador' })
    await expect(page.getByTestId('auditoria-fila').first()).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Filtrar por fecha').selectOption('hoy')
    await expect(page.getByTestId('auditoria-fila').first()).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Filtrar por fecha').selectOption('')
  })

  test('finanzas → Caja can open the cash session', async ({ page }) => {
    await page.goto('/finanzas/caja')
    // El título de la página vive en el topbar (AppShell) y aparece antes que
    // los datos: se espera el estado de caja antes de decidir abrir o cerrar.
    await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible()

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
  await page.goto('/configuracion')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Logo de la empresa' })).toBeVisible()
  await expect(page.getByText('Fondo claro').first()).toBeVisible()
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .first()
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Modo claro sobre fondo claro')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).first().click()
  await expect(page.getByAltText('Modo claro sobre fondo claro')).toHaveCount(0)
})

// Búsqueda de pedidos: se resuelve en el servidor (número, cliente, RUC o
// vendedor), así encuentra pedidos fuera de la página cargada.
test('pedidos → la búsqueda llega al servidor y encuentra por número', async ({ page }) => {
  await page.goto('/pedidos')
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
  await page.goto('/configuracion')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByText('Mi foto')).toBeVisible()
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .last()
    .setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Usar esta foto' }).click()
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
  // Cliente nuevo por corrida: evita el bloqueo por solicitud duplicada y que
  // el cliente ya esté en mayorista. El perfil tiene que abrirse aunque el
  // cliente no tenga pedidos en la sucursal del vendedor.
  const nombre = `Solicitud E2E ${Date.now()}`

  // Sin storage state: la sesión del proyecto es la de gerencia.
  const contextoVendedor = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const vendedor = await contextoVendedor.newPage()
  await vendedor.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await loginAsSeller(vendedor)
  const alta = await vendedor.evaluate(
    async ({ api, nombre }) => {
      const res = await fetch(`${api}/api/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      return { status: res.status }
    },
    { api: API, nombre },
  )
  expect(alta.status, 'el vendedor tiene que poder crear el cliente').toBe(201)

  await vendedor.goto('/clientes')
  await vendedor.getByLabel('Buscar clientes').fill(nombre)
  await vendedor.getByTestId('cliente-fila').filter({ hasText: nombre }).first().click()
  await vendedor.getByRole('button', { name: 'Solicitar mayorista' }).click()
  await vendedor.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(vendedor.getByText('Solicitud enviada', { exact: false })).toBeVisible()
  await contextoVendedor.close()

  await page.goto('/autorizaciones')
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
  await page.goto('/configuracion')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Solicitudes del cliente' })).toHaveCount(0)
  // Las plantillas ya no viven dentro de Configuración: tienen vista propia.
  await page.goto('/plantillas')
  await expect(page.getByRole('heading', { name: 'Plantillas de WhatsApp' })).toBeVisible()
  // Las plantillas de pedidos se listan bajo la categoría Pedidos (el contexto
  // es espejo de la categoría, issue #34): si alguna queda en 'clientes', la
  // pantalla la pierde.
  await expect(page.getByTestId('plantilla-fila').filter({ hasText: 'Pedido listo para retirar' })).toBeVisible()
})

// El dueño trabaja solo: su propia solicitud se resuelve desde la misma
// bandeja (un vendedor o gerente no puede resolver la que pidió).
test('autorizaciones → el dueño resuelve su propia solicitud', async ({ page }) => {
  const nombre = `Autoría E2E ${Date.now()}`
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await page.goto('/clientes')
  const alta = await page.evaluate(
    async ({ api, nombre }) => {
      const res = await fetch(`${api}/api/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      return { status: res.status }
    },
    { api: API, nombre },
  )
  expect(alta.status).toBe(201)

  await page.getByLabel('Buscar clientes').fill(nombre)
  await page.getByTestId('cliente-fila').filter({ hasText: nombre }).first().click()
  await page.getByRole('button', { name: 'Solicitar mayorista' }).click()
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(page.getByText('Solicitud enviada', { exact: false })).toBeVisible()

  await page.goto('/autorizaciones')
  const fila = page.getByTestId('autorizacion-fila').filter({ hasText: nombre }).first()
  await expect(fila).toContainText('Tu solicitud')
  await fila.getByRole('button', { name: 'Aprobar' }).click()
  const aprobar = page.getByRole('dialog')
  await aprobar.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Solicitud aprobada', { exact: false })).toBeVisible()
  await expect(fila.getByText('Aprobada')).toBeVisible()
})

// Consignación de terceros (#33): se marca desde el detalle, se ve la etiqueta
// en el listado y se limpia por API para no dejar el equipo del seed consignado.
test('inventario: marca y quita la consignación de un equipo', async ({ page }) => {
  const tercero = `Tercero E2E ${Date.now()}`
  await page.goto('/inventario')
  const fila = () => page.getByTestId('inventario-fila').filter({ hasText: SEED.products.iphone.imei }).first()
  await fila().click()
  const detalle = page.getByRole('dialog', { name: /iPhone/ })
  await detalle.getByLabel('Consignador', { exact: true }).fill(tercero)
  await detalle.getByLabel('Teléfono del consignador').fill('0981123456')
  await detalle.getByLabel('Monto a pagar al consignador').fill('1500000')
  await detalle.getByRole('button', { name: 'Guardar consignación' }).click()
  await expect(page.getByText('Consignación guardada', { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Consignado').first()).toBeVisible()

  // Limpieza determinista por API.
  await page.evaluate(async ({ api, serial }) => {
    const respuesta = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' })
    const datos = await respuesta.json()
    const unidades = Array.isArray(datos) ? datos : datos.rows || []
    const unidad = unidades.find(item => item.serial === serial)
    if (!unidad) return
    await fetch(`${api}/api/inventory-units`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: unidad.id, action: 'details', consignorName: '', consignorPhone: '', consignorPyg: null }),
    })
  }, { api: API, serial: SEED.products.iphone.imei })
  await page.reload()
  await expect(page.getByText('Consignado')).toHaveCount(0)
})

// Mini CRM de clientes (#121): tabla compacta con búsqueda instantánea,
// perfil en cinco pestañas (Resumen, Pedidos, Cronología, Estadísticas y
// Datos), deuda desglosada, analítica, comentarios internos que nunca salen
// al portal público y datos de facturación/direcciones editables.
async function crmApi(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test.describe('mini CRM de clientes', () => {
  test('tabla compacta: búsqueda instantánea sin Enter y sin scroll horizontal', async ({ page }) => {
    const marca = Date.now()
    const nombre = `CRM Tabla ${marca}`
    await page.goto('/clientes')
    const alta = await crmApi(page, '/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: nombre, phone: `981${String(marca).slice(-6)}`, countryCode: '+595', email: `crm${marca}@correo.com`, tags: ['mini-crm'] }),
    })
    expect(alta.status).toBe(201)

    await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
    await page.goto('/clientes')
    // Sin Enter: la búsqueda se dispara al tipear (diferida).
    await page.getByLabel('Buscar clientes').fill(nombre)
    const fila = page.getByTestId('cliente-fila').filter({ hasText: nombre }).first()
    await expect(fila).toBeVisible()
    // Teléfono siempre con código de país.
    await expect(fila).toContainText('+595 981')
    // Dos acciones de WhatsApp: envío directo y elección de plantilla.
    await expect(fila.getByRole('button', { name: new RegExp(`Enviar WhatsApp a ${nombre}`) })).toBeVisible()
    await expect(fila.getByRole('button', { name: new RegExp(`Elegir plantilla de WhatsApp para ${nombre}`) })).toBeVisible()

    const { scrollWidth, clientWidth } = await page.getByTestId('clientes-tabla').evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
    expect(scrollWidth, 'la tabla de clientes debe entrar sin scroll horizontal').toBeLessThanOrEqual(clientWidth + 1)
  })

  test('ficha: pestañas, cliente desde, deuda por pedido y analítica', async ({ page }) => {
    const marca = Date.now()
    const nombre = `CRM Ficha ${marca}`
    await page.goto('/clientes')
    const alta = await crmApi(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombre, phone: `982${String(marca).slice(-6)}`, countryCode: '+595' }) })
    expect(alta.status).toBe(201)
    const clienteId = alta.body.id

    const productos = await crmApi(page, '/api/products')
    const cable = (productos.body || []).find((row) => row.sku === SEED.products.cable.sku)
    expect(cable?.id, 'el producto sembrado E2E-CABLE debe existir').toBeTruthy()
    const numeroPedido = `E2E-CRM-${marca}`
    const pedido = await crmApi(page, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: numeroPedido,
        customerId: clienteId,
        items: [{ productId: cable.id, description: cable.name, quantity: 2, unitPricePyg: cable.pricePyg }],
        payment: { method: 'CASH', amountPyg: 30000 },
      }),
    })
    expect(pedido.status).toBe(201)

    await page.goto(`/clientes?cliente=${encodeURIComponent(clienteId)}`)
    const ficha = page.getByRole('dialog')
    await expect(ficha.getByRole('heading', { name: nombre })).toBeVisible()

    // Resumen: cliente desde con fecha/hora y usuario que lo creó.
    await expect(ficha.getByText(/Cliente desde .* · Creado por/)).toBeVisible()
    // Deuda desglosada por pedido: el saldo vive en su fila.
    const deuda = ficha.getByTestId('perfil-deuda-fila').filter({ hasText: numeroPedido })
    await expect(deuda).toBeVisible()
    await expect(deuda).toContainText('Gs 60.000')

    // Las cinco pestañas del perfil.
    for (const pestana of ['Resumen', 'Pedidos', 'Cronología', 'Estadísticas', 'Datos']) {
      await expect(ficha.getByRole('tab', { name: new RegExp(`^${pestana}`) })).toBeVisible()
    }

    await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
    await expect(ficha.getByText(numeroPedido).first()).toBeVisible()

    await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
    await expect(ficha.getByText('Frecuencia')).toBeVisible()
    await expect(ficha.getByText('Antigüedad')).toBeVisible()
    await expect(ficha.getByText('Gasto por mes')).toBeVisible()

    await ficha.getByRole('tab', { name: /^Datos/ }).click()
    await expect(ficha.getByText('Configuración comercial')).toBeVisible()
    await expect(ficha.getByRole('button', { name: 'Editar configuración' })).toBeVisible()
    await expect(ficha.getByText('Datos de facturación')).toBeVisible()
    await expect(ficha.getByRole('paragraph').filter({ hasText: /^Direcciones$/ })).toBeVisible()
  })

  test('cronología con comentarios internos que no salen al portal público', async ({ page }) => {
    const marca = Date.now()
    const nombre = `CRM Crono ${marca}`
    await page.goto('/clientes')
    const alta = await crmApi(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombre }) })
    expect(alta.status).toBe(201)
    const clienteId = alta.body.id
    const comentario = `Raya lateral visible solo al equipo ${marca}`
    const nota = await crmApi(page, `/api/customers/${clienteId}/notes`, { method: 'POST', body: JSON.stringify({ content: comentario }) })
    expect(nota.status).toBe(201)
    // La nota pública de la tienda viaja al portal (issue #127); la nota
    // interna del equipo nunca sale de la ficha.
    const notaPublica = `Nota publica de la tienda ${marca}`
    const guardado = await crmApi(page, `/api/customers/${clienteId}`, { method: 'PATCH', body: JSON.stringify({ publicNote: notaPublica }) })
    expect(guardado.status).toBe(200)

    await page.goto(`/clientes?cliente=${encodeURIComponent(clienteId)}`)
    const ficha = page.getByRole('dialog')
    await ficha.getByRole('tab', { name: /^Cronología/ }).click()
    await expect(ficha.getByText('Comentarios internos')).toBeVisible()
    await expect(ficha.getByTestId('perfil-notas').getByText(comentario)).toBeVisible()
    await expect(ficha.getByText('Comentario del equipo').first()).toBeVisible()

    // El portal público (nivel completo) lleva la nota pública de la tienda y
    // jamás la nota interna del equipo.
    const token = await crmApi(page, `/api/customers/${clienteId}/access-token`, { method: 'POST', body: JSON.stringify({ level: 'completo' }) })
    expect(token.status).toBe(200)
    expect(token.body?.token).toBeTruthy()
    const publico = await crmApi(page, `/api/portal/${encodeURIComponent(token.body.token)}`)
    expect(publico.status).toBe(200)
    expect(publico.body.customer.publicNote).toBe(notaPublica)
    const serializado = JSON.stringify(publico.body)
    expect(serializado).toContain(notaPublica)
    expect(serializado).not.toContain(comentario)

    // La vitrina pública (otro portal, mismo token) también la lleva.
    const vitrina = await crmApi(page, `/api/public/portal/${encodeURIComponent(token.body.token)}`)
    expect(vitrina.status).toBe(200)
    expect(vitrina.body.cliente.notaPublica).toBe(notaPublica)
    expect(JSON.stringify(vitrina.body)).not.toContain(comentario)

    // La UI del portal muestra la nota de la tienda y no la interna.
    await page.goto(`/cuenta/${encodeURIComponent(token.body.token)}`)
    await expect(page.getByText('Nota de la tienda')).toBeVisible()
    await expect(page.getByText(notaPublica)).toBeVisible()
    await expect(page.getByText(comentario)).toHaveCount(0)
  })
})

// Ficha completa y seguro del cliente (#160): alta con dos nombres, orden por
// actividad, datos clave en el perfil y seguro con impacto real en el costo de
// la venta (coordinado con FIN).
test('clientes → actividad, alta con dos nombres y seguro del cliente', async ({ page }) => {
  const marca = Date.now()
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await page.goto('/clientes')

  // Alta con primer y segundo nombre desde el modal.
  const primero = `Seguro Primero ${marca}`
  const segundo = 'Segundo E2E'
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  await page.getByLabel('Primer nombre', { exact: true }).fill(primero)
  await page.getByLabel(/Segundo nombre/).fill(segundo)
  await page.getByRole('button', { name: 'Guardar cliente' }).click()
  const nombreCompleto = `${primero} ${segundo}`

  // La búsqueda instantánea lo encuentra por el nombre completo.
  await page.getByLabel('Buscar clientes').fill(primero)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: nombreCompleto }).first()
  await expect(fila).toBeVisible()

  // Un pedido nuevo lo sube por encima de un cliente sin pedidos: la vista
  // ordena por actividad reciente (comparación con "B", creado antes).
  const actividad = `Actividad ${marca}`
  const sinPedidos = `${actividad} B`
  await page.evaluate(async ({ api, nombre }) => {
    await fetch(`${api}/api/customers`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre }) })
  }, { api: API, nombre: sinPedidos })
  const alta = await page.evaluate(async ({ api, nombreCompleto }) => {
    const cliente = await fetch(`${api}/api/customers?q=${encodeURIComponent(nombreCompleto)}`, { credentials: 'include' }).then((r) => r.json())
    const productos = await fetch(`${api}/api/products`, { credentials: 'include' }).then((r) => r.json())
    const cable = (productos || []).find((row) => row.sku === 'E2E-CABLE')
    const pedido = await fetch(`${api}/api/orders`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: `E2E-SEG-${Date.now()}`, customerId: cliente[0].id, items: [{ productId: cable.id, description: cable.name, quantity: 1, unitPricePyg: cable.pricePyg }] }),
    }).then((r) => r.json())
    return { clienteId: cliente[0].id, pedidoId: pedido.id, numero: pedido.orderNumber }
  }, { api: API, nombreCompleto })
  expect(alta.clienteId).toBeTruthy()
  await page.getByLabel('Buscar clientes').fill(actividad)
  await expect(page.getByTestId('cliente-fila').first()).toContainText(nombreCompleto)

  // Perfil: datos clave y últimas órdenes con "Ver todas".
  await page.getByTestId('cliente-fila').filter({ hasText: nombreCompleto }).first().click()
  const ficha = page.getByRole('dialog')
  const claves = ficha.getByTestId('perfil-datos-clave')
  await expect(claves.getByText('Antigüedad:')).toBeVisible()
  await expect(claves.getByText('Paga impuestos:')).toBeVisible()
  await expect(claves.getByText('RUC:')).toBeVisible()
  await expect(claves.getByText('Seguro:')).toBeVisible()
  await expect(ficha.getByText('Últimas órdenes')).toBeVisible()
  await ficha.getByRole('button', { name: /Ver todas/ }).click()
  await expect(ficha.getByRole('tab', { name: /^Pedidos/ })).toHaveAttribute('aria-selected', 'true')

  // Seguro: toggle iPhone + porcentaje personalizado.
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  const toggle = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await ficha.getByLabel('Porcentaje del cliente').fill('25')
  await ficha.getByRole('button', { name: 'Guardar porcentaje' }).click()
  await expect(page.getByText('Seguro del cliente activado.')).toBeVisible()

  // El seguro impacta la venta: la próxima orden suma el 25% al costo real.
  const impacto = await page.evaluate(async ({ api, clienteId }) => {
    const productos = await fetch(`${api}/api/products`, { credentials: 'include' }).then((r) => r.json())
    const cable = (productos || []).find((row) => row.sku === 'E2E-CABLE')
    const pedido = await fetch(`${api}/api/orders`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: `E2E-SEG2-${Date.now()}`, customerId: clienteId, items: [{ productId: cable.id, description: cable.name, quantity: 1, unitPricePyg: cable.pricePyg }] }),
    }).then((r) => r.json())
    const linea = pedido.items?.[0]
    return { insurancePyg: linea?.insurancePyg, unitCostPyg: linea?.unitCostPyg }
  }, { api: API, clienteId: alta.clienteId })
  expect(impacto.insurancePyg, 'la venta del cliente asegurado tiene seguro').toBeGreaterThan(0)
  expect(impacto.unitCostPyg, 'el costo real incluye el seguro').toBeGreaterThan(impacto.insurancePyg)

  // Limpieza: el seguro vuelve a inactivo.
  await page.evaluate(async ({ api, clienteId }) => {
    await fetch(`${api}/api/customers/${clienteId}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insuranceEnabled: false }),
    })
  }, { api: API, clienteId: alta.clienteId })
})

// Rediseño Lote 6-A (#166): Garantías con alta en modal, filtro por estado y
// tabla compacta sin scroll horizontal.
test('garantías → alta en modal, filtro por estado y tabla sin scroll', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = `Cliente Garantía ${marca}`
  await page.goto('/garantias')
  await expect(page.getByRole('button', { name: 'Nuevo caso' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo caso' }).first().click()
  const modal = page.getByRole('dialog', { name: 'Nuevo caso de garantía' })
  await modal.getByPlaceholder('Nombre del cliente').fill(cliente)
  await modal.getByPlaceholder('Serial o IMEI').fill(`GAR-${marca}`)
  await modal.getByPlaceholder('Falla reportada, revisión solicitada…').fill('No enciende')
  await modal.getByRole('button', { name: 'Registrar caso' }).click()
  const fila = page.getByTestId('garantia-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()

  // La tabla entra sin scroll horizontal en desktop.
  const { scrollWidth, clientWidth } = await page.getByTestId('garantias-tabla').evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
  expect(scrollWidth, 'la tabla de garantías no debe scrollear en desktop').toBeLessThanOrEqual(clientWidth + 1)

  // El filtro por estado deja solo lo que corresponde.
  await page.getByRole('button', { name: 'Entregado', exact: true }).click()
  await expect(page.getByTestId('garantia-fila').filter({ hasText: marca })).toHaveCount(0)
  await page.getByRole('button', { name: 'Recibido', exact: true }).click()
  await expect(page.getByTestId('garantia-fila').filter({ hasText: marca }).first()).toBeVisible()
})

// QA por rol (#166): el vendedor ve y usa la ficha del cliente, pero el seguro
// (costo real/margen) sigue siendo de administración/gerencia.
test('clientes → el vendedor ve la ficha pero no configura el seguro', async ({ browser }) => {
  const nombre = `QA Rol ${Date.now()}`
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const vendedor = await contexto.newPage()
  await vendedor.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await loginAsSeller(vendedor)
  const alta = await vendedor.evaluate(async ({ api, nombre }) => {
    const res = await fetch(`${api}/api/customers`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre }) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { api: API, nombre })
  expect(alta.status).toBe(201)

  await vendedor.goto(`/clientes?cliente=${encodeURIComponent(alta.body.id)}`)
  const ficha = vendedor.getByRole('dialog')
  await expect(ficha.getByRole('heading', { name: nombre })).toBeVisible()
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await expect(ficha.getByRole('switch', { name: 'Seguro del cliente activo' })).toBeDisabled()

  // El menú del vendedor no ofrece Garantías y servicio.
  const sidebarNav = vendedor.locator('aside nav')
  await expect(sidebarNav.getByRole('button', { name: 'Clientes', exact: true })).toBeVisible()
  await expect(sidebarNav.getByRole('button', { name: 'Garantías y servicio', exact: true })).toHaveCount(0)
  await contexto.close()
})

// Pulido del portal del cliente (#174): QA a 360/768/1440 con token real, nota
// pública visible, pedidos legibles y comprobante a un toque; la vitrina
// (/portal/:token) usa el mismo token y también entra sin scroll horizontal.
test('portal del cliente → QA 360/768/1440 con nota pública, pedidos y comprobante', async ({ page }) => {
  const marca = Date.now()
  const nombre = `Portal QA ${marca}`
  const nota = `Nota de la tienda ${marca}`
  await page.goto('/clientes')
  const alta = await crmApi(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombre, creditLimitPyg: 500000, creditDays: 15 }) })
  expect(alta.status).toBe(201)
  const clienteId = alta.body.id
  const notaGuardada = await crmApi(page, `/api/customers/${clienteId}`, { method: 'PATCH', body: JSON.stringify({ publicNote: nota }) })
  expect(notaGuardada.status).toBe(200)
  // Se re-lee la nota guardada (el alta no la recibe: se edita en la ficha).
  const ficha = await crmApi(page, `/api/customers/${clienteId}`)
  expect(ficha.body?.customer?.publicNote).toBe(nota)

  const productos = await crmApi(page, '/api/products')
  const cable = (productos.body || []).find((row) => row.sku === SEED.products.cable.sku)
  expect(cable?.id).toBeTruthy()
  const numeroPedido = `E2E-PORTALQA-${marca}`
  const pedido = await crmApi(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ orderNumber: numeroPedido, customerId: clienteId, creditDays: 15, items: [{ productId: cable.id, description: cable.name, quantity: 2, unitPricePyg: cable.pricePyg }], payment: { method: 'CASH', amountPyg: 30000 } }),
  })
  expect(pedido.status).toBe(201)
  const garantia = await crmApi(page, '/api/warranties', { method: 'POST', body: JSON.stringify({ customerId: clienteId, customerName: nombre, serial: `PQA-${marca}`, description: 'Equipo portal QA' }) })
  expect([200, 201]).toContain(garantia.status)

  const token = await crmApi(page, `/api/customers/${clienteId}/access-token`, { method: 'POST', body: JSON.stringify({ level: 'completo' }) })
  expect(token.status).toBe(200)
  const t = encodeURIComponent(token.body.token)
  const sinScrollHorizontal = async () => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  }

  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/cuenta/${t}`)
    await expect(page.getByText('Saldo pendiente')).toBeVisible()
    await expect(page.getByText('Al día')).toHaveCount(0)
    await expect(page.getByText(nota)).toBeVisible()
    await expect(page.getByText(numeroPedido).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Vencimientos' })).toBeVisible()
    await expect(page.getByText('Equipo portal QA')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver comprobante' }).first()).toBeVisible()
    await sinScrollHorizontal()
  }

  // En mobile el comprobante es un objetivo táctil cómodo.
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto(`/cuenta/${t}`)
  const enlace = page.getByRole('link', { name: 'Ver comprobante' }).first()
  const caja = await enlace.boundingBox()
  expect(caja.height, 'el enlace del comprobante debe ser táctil en mobile').toBeGreaterThanOrEqual(36)

  // La vitrina (/portal) con el mismo token: nota pública y pedidos, sin scroll.
  await page.goto(`/portal/${t}`)
  await expect(page.getByRole('heading', { name: 'Nota de la tienda' })).toBeVisible()
  await expect(page.getByText(nota)).toBeVisible()
  await expect(page.getByText(numeroPedido).first()).toBeVisible()
  await expect(page.getByText('Equipo portal QA')).toBeVisible()
  await sinScrollHorizontal()
})
