import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #393 (unidad C1): corregir el medio de un pago desde «Pagos» del pedido.
// Demo frontend-only (sin backend): la corrección se simula en el navegador.
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

async function abrirPagos(page, { conRepartidor = false, desdeConciliacion = false } = {}) {
  if (!desdeConciliacion) await openShellDestination(page, 'Inicio')
  if (conRepartidor) {
    await page.evaluate(async () => {
      const { updateVenta } = await import('/src/lib/storage.js')
      const { listVentas } = await import('/src/lib/storage.js')
      for (const venta of listVentas()) updateVenta(venta.id, { assignedToId: 'demo-user-repartidor' })
    })
  }
  if (desdeConciliacion) {
    await page.goto('/finanzas/conciliacion')
    await page.locator('.conciliacion-f5').getByTestId('conciliacion-fila').first().getByRole('button', { name: 'Ver pedido' }).click()
  } else await page.getByRole('button', { name: /^Pagos( y comprobantes)?$/ }).first().click()
  await expect(page.getByText(/^Pagos ·/)).toBeVisible()
}

const modal = page => page.getByRole('dialog', { name: 'Corregir medio de pago' })

async function elegirCuenta(page, fila, texto) {
  const campo = fila.getByRole('combobox').first()
  await campo.click()
  await campo.fill(texto)
  await page.getByRole('option', { name: new RegExp(texto, 'i') }).first().click()
}

test('Corregir: suma exacta y motivo obligatorio habilitan el envío; Esc cierra', async ({ page }) => {
  await enterDemo(page)
  await abrirPagos(page)
  await page.getByRole('button', { name: 'Corregir', exact: true }).first().click()
  const dialogo = modal(page)
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByTestId('correccion-original')).toContainText('6.850.000')
  const enviar = dialogo.getByRole('button', { name: 'Corregir pago', exact: true })
  const fila = dialogo.getByTestId('correccion-fila').first()
  await expect(enviar).toBeDisabled()

  await elegirCuenta(page, fila, 'Itaú')
  await expect(dialogo.getByTestId('correccion-restante')).toContainText('Suma exacta')
  await expect(enviar).toBeDisabled() // falta el motivo

  await dialogo.getByLabel('Motivo de la corrección').fill('Pagó por transferencia')
  await expect(enviar).toBeEnabled()

  await fila.getByLabel('Monto del pago nuevo 1').fill('6000000')
  await expect(dialogo.getByTestId('correccion-restante')).toContainText('Falta repartir')
  await expect(dialogo.getByTestId('correccion-restante')).toContainText('850.000')
  await expect(enviar).toBeDisabled()

  await fila.getByLabel('Monto del pago nuevo 1').fill('7000000')
  await expect(dialogo.getByTestId('correccion-restante')).toContainText('Se pasa por')
  await expect(enviar).toBeDisabled()

  await page.keyboard.press('Escape')
  await expect(dialogo).toBeHidden()
})

test('Corregir en la demo deja el original revertido, la reversión y el pago nuevo con su motivo', async ({ page }) => {
  await enterDemo(page)
  await abrirPagos(page)
  await page.getByRole('button', { name: 'Corregir', exact: true }).first().click()
  const dialogo = modal(page)
  await elegirCuenta(page, dialogo.getByTestId('correccion-fila').first(), 'Itaú')
  await dialogo.getByLabel('Motivo de la corrección').fill('Pagó por transferencia')
  await dialogo.getByRole('button', { name: 'Corregir pago', exact: true }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByTestId('pago-aviso')).toContainText('Pago corregido')
  await expect(page.getByText('Revertido', { exact: true })).toBeVisible()
  await expect(page.getByText('Reversión', { exact: true })).toBeVisible()
  await expect(page.getByText('Corrección', { exact: true })).toBeVisible()
  await expect(page.getByText('Motivo: Pagó por transferencia').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver corrección' })).toBeVisible()
  // Lo corregido no se vuelve a corregir.
  await expect(page.getByRole('button', { name: 'Corregir', exact: true })).toHaveCount(0)
})

// Los demás roles (gerente, caja, vendedor) quedan cubiertos en src/utils/correccionPago.test.js:
// la demo solo muestra la lista de pagos al dueño en este harness.
test('«Efectivo al repartidor» solo con repartidor asignado y cuenta de efectivo', async ({ page }) => {
  await enterDemo(page)
  await abrirPagos(page, { conRepartidor: true })
  await page.getByRole('button', { name: 'Corregir', exact: true }).first().click()
  let dialogo = modal(page)
  const fila = dialogo.getByTestId('correccion-fila').first()
  await expect(dialogo.getByLabel(/Efectivo al repartidor/)).toHaveCount(0)
  await elegirCuenta(page, fila, 'Caja')
  await expect(dialogo.getByLabel(/Efectivo al repartidor/)).toBeVisible()
  await elegirCuenta(page, fila, 'Itaú')
  await expect(dialogo.getByLabel(/Efectivo al repartidor/)).toHaveCount(0)
})
