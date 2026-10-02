// #297 · Validación global: sin datos válidos no hay acción habilitada.
//
// Cubre los hallazgos de la auditoría v1.0.209 que seguían abiertos:
// - POS: canjear gift card con total Gs 0 (y agregar pago sin total).
// - Gastos: guardar un movimiento vacío.
// - Compras: crear una compra incompleta (proveedor y líneas).
// - Impresoras: agregar una impresora sin nombre ni destino.
// - Promociones: crear un cupón sin datos.
// - Inventario: confirmar un traslado sin campos y aplicar un conteo físico
//   con cero escaneos (UI y API).
// El pago con carrito vacío y el IMEI sin elección ya viven en
// `pos-308-venta-segura.spec.js`.
//
// Capturas: MOBOS_297_CAPTURAS=docs/qa/297-validacion-global \
//   npx playwright test e2e/qa-297-validacion-global.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SALIDA = process.env.MOBOS_297_CAPTURAS || ''
const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await cerrarGuiaDemo(page)
}

async function apiPagina(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
    return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
  }, { api: API, ruta, opciones })
}

test('#297 · gasto vacío: guardar deshabilitado con motivo y mensaje junto al campo', async ({ page }) => {
  await entrarDemo(page)
  await page.goto('/finanzas/gastos')
  await page.getByRole('button', { name: 'Registrar movimiento' }).click()
  const panel = page.getByRole('dialog', { name: 'Registrar salida, cheque o adelanto' })
  const guardar = panel.getByRole('button', { name: 'Guardar movimiento' })

  await expect(guardar).toBeDisabled()
  await expect(guardar).toHaveAttribute('title', /Falta: el monto · la descripción/)

  // La descripción se valida al salir del campo, con su mensaje concreto.
  await panel.locator('#descripcion').click()
  await panel.locator('#descripcion').blur()
  await expect(panel.getByText('Completá la descripción.')).toBeVisible()
  await expect(panel.getByTestId('gastos-motivos')).toContainText('Falta: el monto · la descripción')
  await capturar(page, '01-gasto-incompleto')

  await panel.locator('#monto-gasto').fill('250000')
  await panel.locator('#descripcion').fill('Egreso QA 297')
  await expect(guardar).toBeEnabled()
})

test('#297 · compra incompleta: crear pedido bloqueado y la línea señala qué falta', async ({ page }) => {
  await entrarDemo(page)
  await page.goto('/compras')
  await page.getByRole('button', { name: 'Nueva compra' }).click()
  const panel = page.getByRole('dialog', { name: 'Nueva compra' })
  const crear = panel.getByRole('button', { name: 'Crear pedido' })

  await expect(crear).toBeDisabled()
  await expect(crear).toHaveAttribute('title', /Falta: el proveedor/)

  // Tocar la línea vacía deja el error concreto junto a sus campos.
  await panel.locator('#compra-linea-0-cantidad').click()
  await panel.locator('#compra-linea-0-cantidad').blur()
  await expect(panel.getByText('Elegí el producto.')).toBeVisible()
  await expect(panel.getByTestId('compra-motivos')).toContainText('Falta: el proveedor · las líneas')
  await capturar(page, '02-compra-incompleta')

  // Con proveedor y producto la compra queda válida.
  await panel.locator('#compra-proveedor').fill('Importadora Tecnológica')
  await page.getByRole('option', { name: /Importadora Tecnológica/ }).first().click()
  const producto = panel.getByRole('group', { name: 'Producto' }).getByPlaceholder('Buscar producto…')
  await producto.fill('iPhone 15 Pro 256GB Titanio')
  await page.getByRole('option', { name: /iPhone 15 Pro 256GB Titanio/ }).first().click()
  await expect(crear).toBeEnabled()
})

test('#297 · impresora sin configuración: guardar bloqueado hasta completar nombre y destino', async ({ page }) => {
  await entrarDemo(page)
  await page.goto('/configuracion/dispositivos')
  await page.getByRole('button', { name: 'Agregar impresora' }).click()
  const panel = page.getByRole('dialog', { name: 'Agregar impresora' })
  const guardar = panel.getByRole('button', { name: 'Guardar impresora' })

  await expect(guardar).toBeDisabled()
  await expect(guardar).toHaveAttribute('title', /Falta: el nombre/)

  await panel.locator('#imp-nombre').fill('Térmica QA 297')
  await expect(guardar).toBeEnabled()

  // Sin IP/puerto el destino no existe: el guardado vuelve a bloquearse.
  await panel.locator('#imp-ip').fill('')
  await panel.locator('#imp-puerto').fill('')
  await panel.locator('#imp-ip').click()
  await panel.locator('#imp-puerto').click()
  await expect(guardar).toBeDisabled()
  await expect(guardar).toHaveAttribute('title', /Falta: la IP/)
  await expect(panel.getByText('Completá la IP de la impresora.')).toBeVisible()
  await capturar(page, '03-impresora-sin-configuracion')

  await panel.locator('#imp-ip').fill('192.168.1.50')
  await panel.locator('#imp-puerto').fill('9100')
  await expect(guardar).toBeEnabled()
})

test('#297 · promoción incompleta: crear cupón bloqueado hasta completar los datos', async ({ page }) => {
  await entrarDemo(page)
  await page.goto('/promociones')
  const form = page.locator('form').filter({ hasText: 'Crear cupón' })
  const crear = form.getByRole('button', { name: 'Crear cupón' })

  await expect(crear).toBeDisabled()
  await expect(crear).toHaveAttribute('title', /Falta: el código/)

  // Código demasiado corto: el mensaje aparece al salir del campo.
  await form.getByLabel('Código').fill('A')
  await form.getByLabel('Código').blur()
  await expect(form.getByText(/Usá entre 2 y 40/)).toBeVisible()
  await capturar(page, '04-promocion-incompleta')

  await form.getByLabel('Código').fill(`QA${clave().slice(-6)}`)
  await form.getByLabel('Nombre').fill('Cupón QA 297')
  await form.getByLabel('Inicio (hora local)').fill('2026-10-01T00:00')
  await form.getByLabel('Fin (hora local)').fill('2026-12-31T00:00')
  await expect(crear).toBeEnabled()
})

test('#297 · traslado sin campos: confirmar bloqueado hasta completar origen, destino, modelo y serial', async ({ page }) => {
  await page.goto('/inventario/unidades')
  await page.getByRole('button', { name: 'Transferir', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Transferir IMEI entre sucursales' })
  const confirmar = panel.getByRole('button', { name: 'Confirmar traslado' })

  await expect(confirmar).toBeDisabled()
  await expect(confirmar).toHaveAttribute('title', /Falta: el origen/)
  await panel.locator('#transfer-origen').click()
  await panel.locator('#transfer-origen').blur()
  await expect(panel.getByText('Elegí la sucursal de origen.')).toBeVisible()
  await capturar(page, '05-traslado-sin-campos')

  await panel.locator('#transfer-origen').selectOption(SEED.branchId)
  await panel.locator('#transfer-destino').selectOption(SEED.branch2Id)
  await panel.locator('#transfer-producto').selectOption({ index: 1 })
  await panel.locator('#transfer-seriales').fill(`QA297-${clave()}`)
  await expect(confirmar).toBeEnabled()
  // No se confirma: la prueba verifica que la acción recién queda disponible
  // con todos los datos y no ensucia el stock del arnés.
  await panel.getByRole('button', { name: 'Cerrar' }).click()
})

test('#297 · conteo físico sin escaneos: aplicar bloqueado en la UI y rechazado por la API', async ({ page }) => {
  const nota = `QA 297 ${clave()}`
  let conteoId = null
  await page.goto('/inventario/unidades')
  try {
    await page.getByTestId('tabs-inventario').getByRole('button', { name: 'Conteos', exact: true }).click()
    await page.getByRole('button', { name: 'Nuevo conteo' }).click()
    const nuevo = page.getByRole('dialog', { name: 'Nuevo conteo' })
    await nuevo.locator('#conteo-nota').fill(nota)
    await nuevo.getByRole('button', { name: 'Iniciar conteo' }).click()

    const aplicar = page.getByTestId('aplicar-conteo')
    await expect(aplicar).toBeVisible({ timeout: 20_000 })
    await expect(aplicar).toBeDisabled()
    await expect(aplicar).toHaveAttribute('title', /Escaneá al menos un equipo/)
    await expect(page.getByTestId('conteo-sin-escaneos')).toContainText('no se aplica sin equipos escaneados')
    await capturar(page, '06-conteo-sin-escaneos')

    // La API también lo rechaza: no se ajusta stock con un documento vacío.
    const lista = await apiPagina(page, '/api/inventory-counts?status=DRAFT')
    const fila = (lista.body || []).find((item) => item.note === nota)
    conteoId = fila?.id || null
    expect(conteoId, 'el conteo recién creado aparece en el listado').toBeTruthy()
    const apply = await apiPagina(page, '/api/inventory-counts', { method: 'PATCH', body: JSON.stringify({ id: conteoId, action: 'apply', adjust: true }) })
    expect(apply.status, JSON.stringify(apply.body)).toBe(409)
    expect(String(apply.body?.message || '')).toMatch(/al menos un equipo/i)
  } finally {
    if (conteoId) await apiPagina(page, '/api/inventory-counts', { method: 'PATCH', body: JSON.stringify({ id: conteoId, action: 'cancel' }) }).catch(() => {})
  }
})

test('#297 · POS: con total Gs 0 no se canjean gift cards ni se cargan pagos', async ({ page }) => {
  await entrarDemo(page)
  await page.goto('/pos')
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  await page.getByRole('button', { name: /Funda/ }).first().click()

  // La línea editable permite dejar el total en Gs 0.
  const fila = page.locator('#pos-resumen-venta .divide-y > div').first()
  await fila.getByRole('button', { name: /^Ver detalle de / }).click()
  await fila.getByLabel(/^Precio de venta de /).fill('0')

  const pagar = page.getByRole('button', { name: '+ Agregar pago' })
  const canjear = page.getByRole('button', { name: '+ Canjear gift card' })
  await expect(page.getByTestId('cobro-total-cero')).toContainText('Cargá un producto con precio')
  await expect(pagar).toBeDisabled()
  await expect(canjear).toBeDisabled()
  await expect(canjear).toHaveAttribute('title', /Cargá un producto con precio/)
  await capturar(page, '07-pos-total-cero')

  // Con precio real vuelven a quedar disponibles.
  await fila.getByLabel(/^Precio de venta de /).fill('45000')
  await expect(pagar).toBeEnabled()
  await expect(canjear).toBeEnabled()
})
