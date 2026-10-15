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
  test(`Planilla escritorio 1440 · filas ≤ 40 px, grupos, colores y chips · ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await enterDemo(page)
    if (dark) await setDark(page)
    await abrirPlanilla(page)

    const filas = page.getByTestId('planilla-fila')
    expect(await filas.count(), 'hay unidades en la planilla').toBeGreaterThan(10)
    const alturas = await filas.evaluateAll(nodos => nodos.map(nodo => nodo.getBoundingClientRect().height))
    expect(Math.max(...alturas), 'ninguna fila pasa de 40 px').toBeLessThanOrEqual(40)
    expect(Math.min(...alturas), 'ni baja de 36 px').toBeGreaterThanOrEqual(36)

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
    await expect(reservada.getByTestId('planilla-estado')).toHaveText(/^Atajando · .+ · vence \d{2}\/\d{2}$/)
    await expect(reservada).toHaveAttribute('data-condicion', /new|used/)
    await expect(page.locator('[data-testid="planilla-estado"][data-estado="prestamo"]').first()).toHaveText('Préstamo')

    // Columnas: modelo + batería · ciclos, ingreso, IMEI mono, ubicación con sigla, proveedor con sigla, garantía.
    const semi = page.locator('[data-testid="planilla-fila"][data-condicion="used"]').first()
    await expect(semi.getByTestId('planilla-bateria')).toHaveText(/^\d+% · \d+c$/)
    await expect(semi.getByTestId('planilla-ingreso')).toHaveText(/^\d{2}\/\d{2}(\/\d{2})? · /)
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
