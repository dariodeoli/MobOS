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
const CONFIG = ['negocio', 'modulos', 'equipo', 'ventas-cobros', 'impresion', 'mensajes', 'seguridad', 'sistema', 'mi-cuenta'].map((t) => `/configuracion/${t}`)

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
  const rutasMovil = ['/resumen', '/pos', '/pedidos', '/clientes', '/campanas', '/stock/unidades', '/stock/traslados', '/compras', '/servicio', '/finanzas/caja', '/finanzas/gastos', '/finanzas/creditos', '/finanzas/cuotas', '/finanzas/comisiones', '/analisis/reportes', '/configuracion/negocio', '/ops']
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

// Acciones principales de las pantallas que antes no funcionaban en la demo.
test.describe('demo completa · acciones', () => {
  test.beforeEach(async ({ page }) => {
    // Evita abrir WhatsApp (sitio externo) al probar los envíos: solo registra el intento.
    await page.addInitScript(() => { window.__abiertas = []; window.open = (url) => { window.__abiertas.push(String(url)); return null } })
    await entrarComo(page, 'dueno')
  })

  test('gastos: cargar un movimiento actualiza el libro y los contadores', async ({ page }) => {
    await irA(page, '/finanzas/gastos')
    const antes = await page.getByTestId('gastos-movimientos').innerText()
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()
    await page.getByLabel('Monto (Gs)').fill('120000')
    await page.getByLabel('Descripción').fill('Cafetera nueva')
    await page.getByLabel('Contraparte').fill('Casa Hogar')
    await page.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(page.getByText('Cafetera nueva')).toBeVisible()
    expect(await page.getByTestId('gastos-movimientos').innerText()).not.toBe(antes)
  })

  test('campañas de recompra: segmentos con clientes y envío marcado en la ficha', async ({ page }) => {
    await irA(page, '/campanas')
    await expect(page.getByText(/\d+ en el segmento/)).toBeVisible()
    await expect(page.getByText('Rosana Viveros').first()).toBeVisible()
    await page.getByRole('button', { name: /Abrir el próximo/ }).click()
    expect(await page.evaluate(() => window.__abiertas.length)).toBe(1)
    await expect(page.getByText(/Contactado/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Mayoristas dormidos' }).click()
    await expect(page.getByText(/Celulares del Este|Import Tech/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Deudores al día' }).click()
    await expect(page.getByText(/Ramiro Cáceres|María González|Hugo Benítez/).first()).toBeVisible()
  })

  test('créditos y cuotas: mora, vencimientos y aviso por WhatsApp registrado', async ({ page }) => {
    await irA(page, '/finanzas/creditos')
    await expect(page.getByTestId('creditos-en-mora')).not.toContainText('Gs 0')
    await expect(page.getByTestId('credito-fila').first()).toBeVisible()
    await irA(page, '/finanzas/cuotas')
    await expect(page.getByTestId('cuota-fila').first()).toBeVisible()
    await page.getByRole('button', { name: /^WhatsApp$/ }).first().click()
    expect(await page.evaluate(() => window.__abiertas.length)).toBe(1)
    await expect(page.getByText(/Avisado/).first()).toBeVisible()
  })

  test('comisiones: reglas y liquidaciones sembradas', async ({ page }) => {
    await irA(page, '/finanzas/comisiones')
    await expect(page.getByText('Regla por usuario').first()).toBeVisible()
    await expect(page.getByText('Borrador').first()).toBeVisible()
    await expect(page.getByText('Pagada').first()).toBeVisible()
    // Cobra el borrador sembrado y cierra la liquidación del mes de un vendedor.
    await page.getByRole('button', { name: 'Marcar como pagada' }).first().click()
    await expect(page.getByTestId('comisiones-por-pagar')).toContainText('Gs 0')
    await page.getByRole('button', { name: 'Nueva liquidación' }).click()
    await page.getByLabel('Vendedor de la liquidación').fill('Diego')
    await page.getByRole('option', { name: /Diego López/ }).first().click()
    await page.getByRole('button', { name: 'Cerrar liquidación' }).click()
    await expect(page.getByText('Liquidación cerrada')).toBeVisible()
  })

  test('delivery: viajes, tarifas y cierre semanal con datos', async ({ page }) => {
    await irA(page, '/delivery')
    await page.getByRole('button', { name: 'Viajes y cierres' }).click()
    await expect(page.getByTestId('delivery-trip').first()).toBeVisible()
    await page.getByRole('button', { name: 'Tarifas' }).click()
    await expect(page.getByText('Tarifa vigente')).toBeVisible()
    await page.getByRole('button', { name: 'Cierre semanal' }).click()
    await page.locator('#weekly-branch').selectOption({ label: 'Casa Central' })
    await page.locator('#weekly-driver').selectOption({ label: 'Marcos Aquino' })
    await page.getByRole('button', { name: 'Consultar semana' }).click()
    await expect(page.getByTestId('delivery-weekly-totals')).toBeVisible()
    await expect(page.getByText(/Semana cerrada/)).toBeVisible()
  })

  test('trade-in: valores de toma editables', async ({ page }) => {
    await irA(page, '/trade-in')
    await expect(page.getByText('Valores de toma').first()).toBeVisible()
    // La demo trae el catálogo completo con valores: se busca el modelo en la tabla.
    await page.getByLabel('Buscar valores por modelo').fill('iPhone 15 Pro Max')
    await expect(page.getByText('iPhone 15 Pro Max').first()).toBeVisible()
    await page.getByRole('button', { name: 'Agregar valor' }).click()
    // El modelo se busca en el catálogo y la capacidad depende del modelo.
    await page.locator('#dv-model').fill('iPhone 11')
    await page.getByRole('listbox').getByRole('option').filter({ has: page.locator('span', { hasText: /^iPhone 11$/ }) }).click()
    await page.locator('#dv-storage').selectOption('128GB')
    await page.locator('#dv-condition').selectOption('NEW')
    await page.locator('#dv-base').fill('1500000')
    await page.getByRole('button', { name: 'Guardar valor' }).click()
    await page.getByLabel('Buscar valores por modelo').fill('iPhone 11 128')
    await expect(page.getByText('iPhone 11').first()).toBeVisible()
    await expect(page.getByTestId('valoracion-fila').filter({ has: page.getByText('Nuevo', { exact: true }) })).toHaveCount(1)
  })

  test('traslados, verificaciones y bajas de stock tienen historial', async ({ page }) => {
    await irA(page, '/stock/traslados')
    await expect(page.getByText(/AEX-004711/)).toBeVisible()
    await irA(page, '/stock/verificacion')
    await expect(page.getByText('Todavía no hay verificaciones')).toHaveCount(0)
    await irA(page, '/stock/eliminados')
    await expect(page.getByRole('button', { name: 'Restaurar' }).first()).toBeVisible()
  })
})

// Historia y cronologías: la demo cuenta una historia coherente en cada pedido,
// cliente, producto/IMEI, cuenta, caja, orden de taller y cuota, con movimientos
// en TODOS los períodos (Hoy, Ayer, 7 días, Mes, Mes anterior) sin importar el
// día ni la hora de carga. Las pruebas de coherencia numérica están en
// src/lib/demo/historiaCompleta.test.js; acá se verifica lo que ve la persona.
test.describe('demo completa · historia y cronologías', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null })
    await entrarComo(page, 'dueno')
  })

  const PEDIDOS_EN_TODOS_LOS_ESTADOS = [
    ['demo-venta-recien-1', /Entrega: Pendiente → Preparando/],
    ['demo-venta-recien-2', /Seña por transferencia/],
    ['demo-venta-recien-3', /Listo para retirar/],
    ['demo-venta-hoy-full', /Retirado/],
    ['demo-venta-ayer-pending', /En camino/],
    ['demo-venta-extra-2', /Entregado/],
    ['demo-venta-credito-3', /Crédito autorizado/],
    ['demo-venta-preparacion', /Preparando/],
    ['demo-venta-listo-retiro', /Aviso enviado al cliente por WhatsApp/],
    ['demo-venta-anulada', /Pedido anulado/],
  ]

  test('pedidos: cada estado (recién, preparación, retiro, en camino, entregado, crédito, anulado) tiene cronología con ≥3 eventos', async ({ page }) => {
    for (const [id, texto] of PEDIDOS_EN_TODOS_LOS_ESTADOS) {
      await irA(page, `/pedidos/${id}`)
      const eventos = page.getByTestId('pedido-evento')
      if (!(await eventos.first().isVisible().catch(() => false))) await page.getByRole('button', { name: /Cronología/ }).first().click({ timeout: 3000 }).catch(() => {})
      await expect(eventos.first(), `${id}: sin cronología`).toBeVisible({ timeout: 15000 })
      expect(await eventos.count(), `${id}: eventos`).toBeGreaterThanOrEqual(3)
      await expect(page.getByTestId('pedido-evento').filter({ hasText: texto }).first(), `${id}: ${texto}`).toBeVisible()
    }
  })

  test('clientes: la ficha muestra la cronología (compras, pagos, cuotas, mensajes, garantías, taller) y los 28 clientes tienen ≥3 eventos', async ({ page }) => {
    const datos = await page.evaluate(async () => {
      const { listarClientesDemo, buildDemoTimeline } = await import('/src/lib/demoClientes.js')
      return listarClientesDemo().map((cliente) => ({ id: cliente.id, eventos: buildDemoTimeline(cliente).length, tipos: [...new Set(buildDemoTimeline(cliente).map((e) => e.type))] }))
    })
    expect(datos.length).toBeGreaterThanOrEqual(28)
    expect(datos.filter((fila) => fila.eventos < 3), 'clientes con menos de 3 eventos').toEqual([])
    expect(datos.flatMap((fila) => fila.tipos)).toEqual(expect.arrayContaining(['order', 'payment', 'notice', 'warranty', 'service']))
    await irA(page, '/clientes')
    await page.getByTestId('cliente-fila').first().click()
    await page.getByRole('tab', { name: /Cronología/ }).first().click().catch(async () => { await page.getByRole('button', { name: /Cronología/ }).first().click() })
    await expect(page.locator('li.rounded-xl.border-ink-600').first()).toBeVisible({ timeout: 15000 })
    expect(await page.locator('li.rounded-xl.border-ink-600').count()).toBeGreaterThanOrEqual(3)
  })

  test('productos e IMEI: el kardex cierra contra el stock y cada producto/IMEI tiene ≥3 movimientos', async ({ page }) => {
    const resultado = await page.evaluate(async () => {
      const { construirKardexDemo } = await import('/src/components/productos/kardexDemo.js')
      const { fuentesHistoriaDemo } = await import('/src/lib/demoHistoria.js')
      const { demoInventorySeed } = await import('/src/lib/demoInventory.js')
      const { ACCESORIOS_DEMO } = await import('/src/lib/demo/catalogoPro.js')
      const { historiaUnidadDemo } = await import('/src/lib/demo/historiaStock.js')
      const historia = fuentesHistoriaDemo()
      const { units, products } = demoInventorySeed()
      const malos = []
      for (const [id, name, , , , stock] of ACCESORIOS_DEMO) {
        const k = construirKardexDemo({ producto: { id, name, stock }, unidades: [], historia })
        if (k.saldoInicial !== 0 || k.cierre !== stock || k.movimientos.length < 3 || k.movimientos.some((m) => m.saldo < 0)) malos.push(`${name}: ini ${k.saldoInicial} cierre ${k.cierre}/${stock} mov ${k.movimientos.length}`)
      }
      for (const producto of products) {
        const unidades = units.filter((u) => u.productId === producto.id)
        if (!unidades.length) continue
        const stock = unidades.filter((u) => u.status === 'AVAILABLE' && !u.removedAt).length
        const k = construirKardexDemo({ producto: { id: producto.id, name: producto.nombre, stock }, unidades, historia })
        if (k.saldoInicial !== 0 || k.cierre !== stock || k.movimientos.length < 3) malos.push(`${producto.nombre}: ini ${k.saldoInicial} cierre ${k.cierre}/${stock} mov ${k.movimientos.length}`)
      }
      for (const unidad of units) if (historiaUnidadDemo(unidad, { ventas: historia.ventas }).length < 3) malos.push(`IMEI ${unidad.serial}`)
      return malos
    })
    expect(resultado, resultado.join('\n')).toEqual([])
    await irA(page, '/productos')
    await page.getByTestId('producto-fila').first().click()
    await page.getByTestId('kardex-abrir').click()
    await expect(page.getByTestId('kardex-tabla')).toBeVisible({ timeout: 15000 })
    expect(await page.getByTestId('kardex-movimiento').count()).toBeGreaterThanOrEqual(3)
  })

  test('cuentas: cada cuenta (caja, bancos, tarjetas, billeteras) tiene movimientos en Hoy, Ayer, 7 días, Mes y Mes anterior', async ({ page }) => {
    const vacios = await page.evaluate(async () => {
      const { librosDemo } = await import('/src/lib/demoHistoria.js')
      const { PERIODOS, enPeriodo } = await import('/src/lib/demo/historiaCuentas.js')
      const libros = librosDemo()
      const salida = []
      for (const cuenta of libros.cuentas) {
        if (cuenta.movimientos.some((m) => m.saldoPyg < 0)) salida.push(`${cuenta.name}: saldo negativo`)
        for (const periodo of PERIODOS) if (!cuenta.movimientos.some((m) => enPeriodo(m, periodo.id))) salida.push(`${cuenta.name} · ${periodo.label}`)
      }
      return salida
    })
    expect(vacios, vacios.join('\n')).toEqual([])
    await irA(page, '/finanzas/bancos')
    for (const nombre of ['Caja · Guaraníes', 'Itaú · Cuenta corriente', 'Pix · Itaú']) {
      await page.getByRole('button', { name: `Movimientos de ${nombre}` }).click()
      const modal = page.getByTestId('cuenta-movimientos')
      await expect(modal).toBeVisible()
      for (const periodo of ['Hoy', 'Ayer', '7 días', 'Mes', 'Mes anterior']) {
        await modal.getByRole('button', { name: periodo, exact: true }).click()
        await expect(modal.getByTestId('cuenta-mov-fila').first(), `${nombre} · ${periodo}`).toBeVisible()
        await expect(modal.getByTestId('cuenta-mov-vacio')).toHaveCount(0)
      }
      await page.getByRole('button', { name: 'Cerrar' }).last().click()
    }
  })

  test('caja: la cronología del turno muestra apertura, cobros, movimientos y saldos', async ({ page }) => {
    await irA(page, '/finanzas/caja')
    await page.getByTestId('caja-cronologia-demo').click()
    await expect(page.getByText('Apertura de caja').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Cobro de pedido|Seña de pedido|Cobro de cuota/).first()).toBeVisible()
  })

  test('taller: cada orden abre un historial por etapa con ≥3 eventos; las cuotas, su historial de pagos y mora', async ({ page }) => {
    await irA(page, '/servicio')
    await page.getByRole('button', { name: /Ver detalle de iPad 10/ }).first().click()
    const historial = page.getByTestId('taller-historial')
    await expect(historial).toBeVisible({ timeout: 15000 })
    await expect(historial.getByText('Equipo recibido')).toBeVisible()
    await expect(historial.getByText(/Etapa: /).first()).toBeVisible()
    await irA(page, '/finanzas/cuotas')
    await page.getByTestId('cuota-historial-abrir').first().click()
    const cuota = page.getByTestId('cuota-historial')
    await expect(cuota.getByText('Plan de crédito creado')).toBeVisible({ timeout: 15000 })
    await expect(cuota.getByText(/Entrega inicial cobrada/)).toBeVisible()
  })

  test('períodos: pedidos, cotizaciones, taller y gastos tienen datos de recién, hoy, ayer, la semana, el mes y el mes anterior', async ({ page }) => {
    const faltan = await page.evaluate(async () => {
      const { listVentas } = await import('/src/lib/storage.js')
      const { PERIODOS, rangoPeriodo } = await import('/src/lib/demo/historiaCuentas.js')
      const { listDemoQuotes } = await import('/src/lib/demo/cotizaciones.js')
      const { getDemoServicio } = await import('/src/lib/demoServicio.js')
      const { gastosDemo } = await import('/src/lib/demo/finanzas.js')
      const ahora = new Date()
      const dentro = (valor, periodo) => { const [desde, hasta] = rangoPeriodo(periodo, ahora); const t = new Date(valor).getTime(); return t >= desde && t < hasta }
      const ventas = listVentas()
      const salida = []
      for (const p of PERIODOS) {
        if (!ventas.some((v) => dentro(v.creadoEn, p.id))) salida.push(`pedidos · ${p.label}`)
        if (!listDemoQuotes().some((c) => dentro(c.createdAt, p.id))) salida.push(`cotizaciones · ${p.label}`)
        if (!getDemoServicio().rows.some((o) => dentro(o.receivedAt, p.id))) salida.push(`taller · ${p.label}`)
        if (!gastosDemo(ahora).some((g) => dentro(g.creadoEn, p.id))) salida.push(`gastos · ${p.label}`)
      }
      if (!ventas.some((v) => ahora.getTime() - new Date(v.creadoEn).getTime() <= 30 * 60000)) salida.push('pedidos · recién (≤30 min)')
      if (new Set(ventas.filter((v) => dentro(v.creadoEn, 'hoy')).map((v) => v.fulfillmentStatus)).size < 3) salida.push('pedidos de hoy en menos de 3 estados')
      return salida
    })
    expect(faltan, faltan.join('\n')).toEqual([])
  })
})
