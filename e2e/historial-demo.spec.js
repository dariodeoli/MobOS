// Historiales de las fichas en la demo: la ficha del cliente muestra todos los
// tipos de historial con totales, filtros por tipo y período, y abre el pedido;
// el proveedor trae saldo, productos comprados y «Ver más»; el funcionario
// trae ventas y comisiones. Todo sin pegarle al API real.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openShellDestination } from './helpers/shell-navigation.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'rediseno')

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

test('demo: ficha de cliente con cada historial, filtros y pedido abierto desde la fila', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const apiReal = []
  page.on('request', (request) => { if (/\/api\/customers\/[^/]+\/timeline/.test(request.url())) apiReal.push(request.url()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await openShellDestination(page, 'Clientes')
  await page.getByLabel('Buscar clientes').fill('Lucía')
  await page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first().click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()

  const resumen = ficha.getByTestId('perfil-historial-resumen')
  await expect(resumen).toContainText('Gastado')
  await expect(resumen).toContainText('Ticket promedio')
  await expect(resumen).toContainText('Última compra')
  await expect(resumen).toContainText('Saldo pendiente')

  // Cada tipo de historial tiene su filtro y devuelve solo lo suyo.
  for (const [grupo, hayEventos] of [['compras', true], ['pagos', true], ['saldo', true], ['cotizaciones', true], ['mensajes', true], ['notas', true], ['datos', true]]) {
    await ficha.getByTestId(`historial-grupo-${grupo}`).click()
    if (hayEventos) await expect(ficha.getByTestId('historial-evento').first(), `Lucía tiene historial de ${grupo}`).toBeVisible()
    expect(await ficha.getByTestId('historial-evento').evaluateAll((nodos, esperado) => nodos.every((nodo) => nodo.dataset.grupo === esperado), grupo), `solo ${grupo}`).toBe(true)
  }

  await ficha.getByTestId('historial-grupo-compras').click()
  const compra = ficha.getByTestId('historial-evento').filter({ has: page.getByTestId('historial-ver-productos') }).first()
  await compra.getByTestId('historial-ver-productos').click()
  await expect(compra.getByTestId('historial-productos')).toBeVisible()
  await resumen.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(DIR, 'historial-cliente.png') })

  await ficha.getByTestId('historial-periodo').selectOption('30')
  await ficha.getByTestId('historial-grupo-todo').click()
  await expect(ficha.getByTestId('historial-evento').first()).toBeVisible()
  await ficha.getByTestId('historial-periodo').selectOption('todo')

  await ficha.getByTestId('historial-grupo-compras').click()
  await ficha.getByTestId('historial-evento').filter({ has: page.getByTestId('historial-abrir-pedido') }).first().getByTestId('historial-abrir-pedido').click()
  await expect(page).toHaveURL(/\/pedidos\/[^/]+$/)
  expect(apiReal, 'la demo no consulta el historial real').toHaveLength(0)
})

test('demo: proveedor con saldo y productos comprados, funcionario con ventas y comisiones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await page.goto('/compras')
  await page.getByRole('button', { name: 'Proveedores', exact: true }).click()
  await page.getByTestId('proveedores-tabla').getByRole('button', { name: /^Historial de / }).first().click()
  const proveedor = page.getByTestId('proveedor-resumen')
  await expect(proveedor).toContainText('Comprado')
  await expect(proveedor).toContainText('Saldo pendiente')
  await proveedor.getByText(/Productos comprados/).click()
  await expect(page.getByTestId('proveedor-productos').locator('li').first()).toBeVisible()

  await page.goto('/configuracion/equipo')
  await page.getByRole('button', { name: 'Historial de Diego López' }).first().click()
  const resumen = page.getByTestId('funcionario-resumen-metricas')
  await expect(resumen).toContainText('Ventas')
  await expect(resumen).toContainText('Comisión pendiente')
})
