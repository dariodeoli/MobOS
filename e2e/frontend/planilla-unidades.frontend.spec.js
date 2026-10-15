import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { expectLayoutContract, measureLayout } from './helpers/layoutContract.js'

// #400 · Planilla de Unidades (unidad H). Demo frontend-only (sin backend): las
// unidades, ubicaciones y proveedores salen del inventario demo de la app.
const out = process.env.MOBOS_PLANILLA_OUT || '/tmp/mobos-planilla'
const NOMBRES_REALES = ['Importadora Tecnológica', 'Distribuidora del Este', 'Mayorista Apple PY']

async function enterDemo(page, role = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function setDark(page) {
  const mobile = page.viewportSize().width < 1024
  await page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page.getByRole('dialog', { name: 'Perfil y preferencias' }).getByRole('button', { name: 'Cambiar a tema oscuro', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}

async function settle(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await page.waitForTimeout(200)
}

// Abre Unidades y pasa a Planilla: con >= 640 px el conmutador está en la barra; en celular, en «Más».
async function abrirPlanilla(page) {
  await openShellDestination(page, 'Unidades')
  await settle(page)
  if (page.viewportSize().width >= 640) {
    await page.getByTestId('vista-unidades-planilla').click()
  } else {
    await page.getByTestId('barra-inventario').getByRole('button', { name: 'Más', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Ver como planilla' }).click()
  }
  await expect(page.getByTestId('planilla-unidades')).toBeVisible()
}

const textoDe = async (page, selector) => page.locator(selector).first().evaluate(el => el.innerText)

for (const dark of [false, true]) {
  test(`Planilla escritorio 1440 · filas 32–36 px, grupos, colores y chips · ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await enterDemo(page)
    if (dark) await setDark(page)
    await abrirPlanilla(page)
    await verTodasLasSucursales(page)

    const filas = page.getByTestId('planilla-fila')
    expect(await filas.count(), 'hay unidades en la planilla').toBeGreaterThan(10)
    const alturas = await filas.evaluateAll(nodos => nodos.map(nodo => nodo.getBoundingClientRect().height))
    expect(Math.max(...alturas), 'ninguna fila pasa de 36 px').toBeLessThanOrEqual(36)
    expect(Math.min(...alturas), 'ni baja de 32 px').toBeGreaterThanOrEqual(32)

    // Agrupada por modelo, con las disponibles en cada encabezado.
    const grupos = page.getByTestId('planilla-grupo')
    expect(await grupos.count()).toBeGreaterThan(2)
    await expect(page.getByTestId('planilla-grupo-disponibles').first()).toContainText(/disponible/)
    await expect(grupos.first()).toHaveAttribute('aria-expanded', 'true')
    const antes = await filas.count()
    await grupos.first().click()
    await expect(grupos.first()).toHaveAttribute('aria-expanded', 'false')
    expect(await filas.count(), 'plegar un grupo oculta sus filas').toBeLessThan(antes)
    await grupos.first().click()
    expect(await filas.count()).toBe(antes)

    // Color por condición con tokens: nuevo y semi nuevo se ven distintos y los tokens existen en este tema.
    const colores = await page.evaluate(() => {
      const fondo = condicion => {
        const fila = document.querySelector(`[data-testid="planilla-fila"][data-condicion="${condicion}"]:not([data-tono])`) || document.querySelector(`[data-testid="planilla-fila"][data-condicion="${condicion}"]`)
        return fila ? getComputedStyle(fila).backgroundColor : null
      }
      const raiz = getComputedStyle(document.documentElement)
      return { nuevo: fondo('new'), usado: fondo('used'), tokenNuevo: raiz.getPropertyValue('--cond-new-bg').trim(), tokenUsado: raiz.getPropertyValue('--cond-used-bg').trim() }
    })
    expect(colores.nuevo, 'hay filas nuevas').toBeTruthy()
    expect(colores.usado, 'hay filas semi nuevas').toBeTruthy()
    expect(colores.nuevo).not.toBe(colores.usado)
    expect(colores.tokenNuevo).toMatch(/^\d+ \d+ \d+$/)
    expect(colores.tokenUsado).toMatch(/^\d+ \d+ \d+$/)

    // El estado es un chip aparte: reservado («Atajando · cliente · vence dd/mm») y préstamo.
    const reservada = page.locator('[data-testid="planilla-fila"][data-estado="reservado"]').first()
    await expect(reservada.getByTestId('planilla-estado')).toHaveText(/^RES, Atajando · .+ · vence \d{2}\/\d{2}$/)
    await expect(reservada).toHaveAttribute('data-condicion', /new|used/)
    await expect(page.locator('[data-testid="planilla-estado"][data-estado="prestamo"]').first()).toHaveText('PRÉ, Préstamo')

    // Columnas: modelo + batería con todos los dígitos (% · ciclos), ingreso, IMEI mono, ubicación con sigla, proveedor con sigla, garantía.
    const semi = page.locator('[data-testid="planilla-fila"][data-condicion="used"]').first()
    await expect(semi.getByTestId('planilla-bateria')).toHaveText(/^\d+% · \d+ ciclos$/)
    // «Ingreso» es la primera columna que se suelta cuando el ancho no alcanza (a 1440 con el menú abierto no entra).
    await expect(semi.getByTestId('unidad-imei')).toHaveClass(/font-mono/)
    await expect(semi.getByTestId('ubicacion-badge')).toBeVisible()
    await expect(semi.getByTestId('proveedor-badge')).toHaveText(/^[A-Z]{3,8}$/)
    await expect(page.getByTestId('planilla-garantia').filter({ hasText: /\d{4}|expirada/ }).first()).toBeVisible()
    await expect(page.getByTestId('planilla-encabezado').getByText('Costo', { exact: true })).toBeVisible()

    await expectLayoutContract(page, `Planilla 1440 ${dark ? 'dark' : 'light'}`, { scope: 'all' })
    await page.screenshot({ path: `${out}/planilla-1440-${dark ? 'oscuro' : 'claro'}.png` })
  })
}

test('Planilla: nota editable en la fila y la elección Tarjetas/Planilla se recuerda', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  const fila = page.getByTestId('planilla-fila').first()
  await fila.getByTestId('planilla-nota').click()
  const campo = fila.getByTestId('planilla-nota-input')
  await campo.fill('garantía enero 2027')
  await campo.press('Enter')
  await expect(fila.getByTestId('planilla-nota')).toContainText('garantía enero 2027')
  // Buscar por nota (la búsqueda de la demo cubre IMEI, modelo, sigla y nota).
  await page.getByLabel('Buscar en inventario').fill('MAYAPY')
  await expect.poll(async () => {
    const siglas = await page.getByTestId('proveedor-badge').allInnerTexts()
    return siglas.length > 0 && siglas.every(sigla => sigla === 'MAYAPY')
  }, { message: 'la búsqueda por sigla deja solo unidades de MAYAPY' }).toBe(true)
  // Cambiar de pestaña y volver conserva la vista elegida.
  await openShellDestination(page, 'Traslados')
  await openShellDestination(page, 'Unidades')
  await expect(page.getByTestId('planilla-unidades')).toBeVisible()
  await page.getByTestId('vista-unidades-tarjetas').click()
  await expect(page.getByTestId('planilla-unidades')).toHaveCount(0)
  await expect(page.getByTestId('inventario-tabla')).toBeVisible()
})

for (const dark of [false, true]) {
  test(`Planilla celular 390 · lista compacta sin scroll horizontal · ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await enterDemo(page)
    if (dark) await setDark(page)
    await abrirPlanilla(page)
    await expect(page.getByTestId('planilla-unidades')).toHaveAttribute('data-modo', 'movil')
    const filas = page.getByTestId('planilla-fila-movil')
    expect(await filas.count()).toBeGreaterThan(5)
    const alturas = await filas.evaluateAll(nodos => nodos.map(nodo => nodo.getBoundingClientRect().height))
    expect(Math.min(...alturas), 'objetivo táctil ≥ 44 px').toBeGreaterThanOrEqual(44)
    const primera = filas.first()
    await expect(primera.getByTestId('unidad-modelo')).toBeVisible()
    await expect(primera.getByTestId('unidad-imei')).toHaveText(/^…\d{6}$/)
    await expect(primera.getByTestId('ubicacion-badge')).toBeVisible()
    const m = await measureLayout(page)
    expect(m.hscroll, 'sin scroll horizontal a 390').toBe(false)
    await expectLayoutContract(page, `Planilla 390 ${dark ? 'dark' : 'light'}`, { scope: 'all', top: 216 })
    await page.screenshot({ path: `${out}/planilla-390-${dark ? 'oscuro' : 'claro'}.png` })
    // Tocar una fila abre la ficha de la unidad.
    await primera.click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
  })
}

test('Sin permiso de proveedor: la planilla solo muestra siglas, nunca el nombre real (vendedor o caja)', async ({ page }) => {
  // En la demo solo gerencia llega a Unidades, así que la planilla se monta con los
  // permisos de un vendedor (sin costo ni nombre de proveedor) sobre las unidades demo,
  // que sí traen el nombre real en `supplierName`: la pantalla no debe imprimirlo.
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Unidades')
  await settle(page)
  const resultado = await page.evaluate(async () => {
    const recurso = nombre => performance.getEntriesByType('resource').map(r => r.name).find(url => url.includes(nombre))
    const React = await import(recurso('/deps/react.js') || recurso('react.js'))
    const ReactDOM = await import(recurso('react-dom_client'))
    const { default: PlanillaUnidades } = await import('/src/components/stock/PlanillaUnidades.jsx')
    const { listarStockItemsDemo } = await import('/src/lib/demo/stockItems.js')
    const demo = await import('/src/lib/demoInventory.js')
    const todos = listarStockItemsDemo({ limit: 200, kind: 'unit' }, { units: demo.listDemoUnits('', 'active'), removed: [], products: [], branches: [] }).items
    const nombres = [...new Set(todos.map(item => item.supplierName).filter(Boolean))]
    // Un cliente demo comparte nombre con un proveedor («Distribuidora del Este»): se anonimiza para que el chequeo mida solo al proveedor.
    const items = todos.map(item => (item.reservationCustomer ? { ...item, reservationCustomer: 'Cliente reservado' } : item))
    const raiz = document.createElement('div')
    raiz.id = 'montaje-planilla'
    document.body.append(raiz)
    const h = (React.default || React).createElement
    ;(ReactDOM.default || ReactDOM).createRoot(raiz).render(h(PlanillaUnidades, {
      items, angosta: false, verCosto: false, rolVeCosto: false, seleccionados: [], onAlternar() {}, onMarcarTodos() {}, onAbrir() {}, accionesDe: () => [], busy: false, onGuardarNota: async () => true,
    }))
    await new Promise(resolver => setTimeout(resolver, 500))
    return { html: raiz.innerHTML, texto: raiz.innerText, nombres, filas: raiz.querySelectorAll('[data-testid="planilla-fila"]').length }
  })
  expect(resultado.nombres.length, 'las unidades demo traen nombres reales de proveedor').toBeGreaterThan(1)
  expect(resultado.filas).toBeGreaterThan(10)
  for (const nombre of resultado.nombres) {
    expect(resultado.html, `${nombre} no está en el DOM (ni en tooltips ni en atributos)`).not.toContain(nombre)
    expect(resultado.texto).not.toContain(nombre)
  }
  expect(resultado.html).toContain('data-testid="proveedor-badge"')
  expect(resultado.html, 'sin permiso de costo no hay columna de costo').not.toContain('>Costo<')
})

// #466 · Planilla v2: apretada, columnas fijas alineadas, abreviaturas, nota de venta, verificación y personalización.
async function verTodasLasSucursales(page) {
  const chip = page.getByTestId('filtro-sucursal-abrir')
  if (await chip.count()) {
    await chip.click()
    await page.getByTestId('filtro-sucursal-todos').click()
  }
}

test('Planilla v2 · 1440: filas de 32–36 px y encabezado y celdas alineados en columnas fijas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  await verTodasLasSucursales(page)
  const medidas = await page.evaluate(() => {
    const caja = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10 } }
    const encabezado = [...document.querySelector('[data-testid="planilla-encabezado"]').children].map(caja)
    const filas = [...document.querySelectorAll('[data-testid="planilla-fila"]')]
    return {
      encabezado,
      alturas: filas.map(fila => fila.getBoundingClientRect().height),
      columnas: filas.map(fila => [...fila.children].map(caja)),
      desbordan: filas.filter(fila => fila.scrollWidth > fila.clientWidth + 1).length,
      checkbox: filas.slice(0, 5).map(fila => caja(fila.querySelector('input[type="checkbox"]'))),
      modelo: filas.slice(0, 5).map(fila => caja(fila.querySelector('[data-testid="unidad-modelo"]'))),
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(medidas.alturas.length).toBeGreaterThan(10)
  expect(Math.max(...medidas.alturas)).toBeLessThanOrEqual(36)
  expect(Math.min(...medidas.alturas)).toBeGreaterThanOrEqual(32)
  expect(medidas.hscroll, 'sin scroll horizontal a 1440').toBe(false)
  expect(medidas.desbordan, 'ninguna fila desborda su ancho').toBe(0)
  // Misma cantidad de celdas que de títulos y cada una empieza y mide lo mismo que su título (±1,5 px) en todas las filas.
  for (const celdas of medidas.columnas) {
    expect(celdas.length).toBe(medidas.encabezado.length)
    celdas.forEach((celda, i) => {
      expect(Math.abs(celda.l - medidas.encabezado[i].l), `columna ${i} alineada`).toBeLessThanOrEqual(1.5)
      expect(Math.abs(celda.w - medidas.encabezado[i].w), `ancho de la columna ${i}`).toBeLessThanOrEqual(1.5)
    })
  }
  // El modelo queda pegado a la casilla, que está en la columna de su título.
  medidas.checkbox.forEach((caja, i) => {
    expect(caja.l).toBeGreaterThanOrEqual(medidas.encabezado[0].l - 1)
    expect(caja.r).toBeLessThanOrEqual(medidas.encabezado[1].l)
    expect(medidas.modelo[i].l - caja.r, 'modelo pegado a la casilla').toBeLessThanOrEqual(14)
  })
})

test('Planilla v2 · 1440: abreviaturas por defecto, condición, estado con color y nota de venta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  await verTodasLasSucursales(page)
  // Sucursal·depósito abreviados («VIL · DEP-VM»): nunca «Sucursal …» en el texto visible; el nombre va en el tooltip.
  await expect(page.getByTestId('planilla-fila').first().getByTestId('ubicacion-badge')).toHaveAttribute('title', /.+/)
  const textos = await page.getByTestId('planilla-fila').evaluateAll(filas => filas.map(f => f.querySelector('[data-testid="ubicacion-badge"]')?.querySelector('.truncate')?.textContent || ''))
  expect(textos.some(t => / · /.test(t)), 'hay sucursal · depósito abreviados').toBe(true)
  expect(textos.every(t => !/Sucursal|Depósito/.test(t))).toBe(true)
  await expect(page.getByTestId('planilla-condicion').first()).toHaveText(/^(NUE|SEM)$/)
  // Estados con ícono, 3 letras y tono (también disponible).
  const estados = await page.getByTestId('planilla-estado').evaluateAll(chips => chips.map(c => ({ t: c.querySelector('span')?.textContent, tono: c.dataset.tono, icono: Boolean(c.querySelector('svg')) })))
  expect(estados.length).toBeGreaterThan(10)
  expect(estados.every(e => /^[A-ZÁÉÍÓÚ]{3}$/.test(e.t) && e.tono && e.icono)).toBe(true)
  // Vendido de hoy: número de nota y ✓ si se entregó; si no, «sin entregar».
  const vendidos = page.locator('[data-testid="planilla-fila"][data-estado="vendido"]')
  const entregada = vendidos.filter({ has: page.locator('[data-entregado="true"]') }).first()
  await expect(entregada.getByTestId('planilla-nota-venta')).toHaveText(/^MOB-\d{4}$/)
  await expect(entregada.getByTestId('planilla-nota-venta').locator('svg')).toBeVisible()
  const pendiente = vendidos.filter({ has: page.locator('[data-entregado="false"]') }).first()
  await expect(pendiente.getByTestId('planilla-nota-venta')).toHaveText(/^MOB-\d{4}sin entregar$/)
})

test('Planilla v2 · 1440: columna Verificado con avatar, fecha y hora, y verificar desde la fila', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  await verTodasLasSucursales(page)
  const verificada = page.locator('[data-testid="planilla-verificado"][data-verificada="true"]').first()
  await expect(verificada).toBeVisible()
  await expect(verificada).toHaveText(/^(hoy |\d{2}\/\d{2} )\d{2}:\d{2}$/)
  await expect(verificada).toHaveAttribute('title', /^Verificó .+ el .+/)
  const antes = await page.locator('[data-testid="planilla-verificado"][data-verificada="true"]').count()
  const sin = page.locator('[data-testid="planilla-verificado"][data-verificada="false"]').first()
  await expect(sin).toContainText('sin verificar')
  await sin.getByTestId('planilla-verificar').click()
  await expect.poll(async () => page.locator('[data-testid="planilla-verificado"][data-verificada="true"]').count()).toBeGreaterThan(antes)
})

test('Planilla v2 · sucursal: arranca en la activa, «Todas» muestra el resto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  const chip = page.getByTestId('filtro-sucursal-abrir')
  await expect(chip, 'el chip muestra la sucursal activa').toContainText('Sucursal:')
  const total = async () => Number((await page.getByTestId('stock-mostrando').innerText()).match(/de ([\d.]+)/)[1].replace(/\./g, ''))
  const propias = await total()
  await chip.click()
  await expect(page.getByTestId('filtro-sucursal-todos')).toHaveText('Todas')
  await page.getByTestId('filtro-sucursal-todos').click()
  await expect.poll(total).toBeGreaterThan(propias)
  await expect(chip).not.toContainText('Sucursal:')
})

test('Planilla v2 · personalizar: IMEI a 4 dígitos, ubicación a nombre completo y columnas, por usuario', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirPlanilla(page)
  await verTodasLasSucursales(page)
  await expect(page.getByTestId('unidad-imei').first()).toHaveText(/^\d{10,}$/)
  await page.getByTestId('planilla-personalizar-abrir').click()
  const panel = page.getByTestId('planilla-personalizar')
  await expect(panel).toBeVisible()
  await panel.getByTestId('planilla-pref-imei-ultimos4').click()
  await panel.getByTestId('planilla-pref-ubicacion-nombre').click()
  await panel.getByTestId('planilla-col-garantia').uncheck()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('unidad-imei').first()).toHaveText(/^…\d{4}$/)
  await expect(page.getByTestId('planilla-garantia')).toHaveCount(0)
  await expect(page.getByTestId('planilla-encabezado').getByText('Garantía', { exact: true })).toHaveCount(0)
  const nombre = await page.getByTestId('planilla-fila').first().getByTestId('ubicacion-badge').locator('.truncate').innerText()
  expect(nombre.length, 'nombre completo, no sigla').toBeGreaterThan(8)
  // Con la grilla cambiada, el encabezado y las filas siguen alineados y sin scroll horizontal.
  const alineado = await page.evaluate(() => {
    const enc = [...document.querySelector('[data-testid="planilla-encabezado"]').children].map(el => el.getBoundingClientRect().left)
    return [...document.querySelectorAll('[data-testid="planilla-fila"]')].every(fila => [...fila.children].every((el, i) => Math.abs(el.getBoundingClientRect().left - enc[i]) <= 1.5))
  })
  expect(alineado).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  // Vuelve «como la empresa» con un clic.
  await page.getByTestId('planilla-personalizar-abrir').click()
  await panel.getByTestId('planilla-pref-empresa').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('unidad-imei').first()).toHaveText(/^\d{10,}$/)
})

test('Planilla v2 · 390: lista compacta sin scroll horizontal y sin botón de personalizar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await abrirPlanilla(page)
  await expect(page.getByTestId('planilla-unidades')).toHaveAttribute('data-modo', 'movil')
  await expect(page.getByTestId('planilla-personalizar-abrir')).toHaveCount(0)
  expect((await measureLayout(page)).hscroll, 'sin scroll horizontal a 390').toBe(false)
  const cajas = await page.getByTestId('planilla-fila-movil').evaluateAll(filas => filas.map(f => ({ r: f.getBoundingClientRect().right, h: f.getBoundingClientRect().height, sobra: f.scrollWidth - f.clientWidth })))
  expect(cajas.length).toBeGreaterThan(3)
  expect(cajas.every(c => c.r <= 390 && c.h >= 44 && c.sobra <= 1)).toBe(true)
})
