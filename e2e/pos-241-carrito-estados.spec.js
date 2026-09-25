// #241/#148 · Estados del carrito: la fila y el bloque de cobro dicen de un
// vistazo qué necesitan (acento + chips), con los tonos de la casa
// (`lib/estadoEquipo`) y la micro-animación de alta/expansión.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearCupon(page) {
  const codigo = `QAEST${Date.now().toString(36).toUpperCase()}`
  await page.evaluate(async ({ api, codigo }) => {
    const respuesta = await fetch(`${api}/api/promotions`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codigo, name: `Estados QA ${codigo}`, kind: 'PERCENT', value: 10, startsAt: new Date(Date.now() - 86_400_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() }),
    })
    if (!respuesta.ok) throw new Error(`promotions: ${respuesta.status} ${(await respuesta.text()).slice(0, 160)}`)
  }, { api: API, codigo })
  return codigo
}

test('la linea del carrito muestra su estado y sus chips (#241)', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente estados ${Date.now().toString(36)}`)
  const buscar = page.getByPlaceholder('Buscar producto…')
  const filas = page.locator('#pos-resumen-venta .divide-y > div')

  // Accesorio: línea lista, con la animación de alta aplicada al montar.
  await buscar.fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  const filaCable = filas.filter({ hasText: SEED.products.cable.name })
  await expect(filaCable).toHaveAttribute('data-estado', 'listo')
  await expect(filaCable).toHaveClass(/mobos-aparece/)

  // Producto serializado: el estado avisa que falta el IMEI.
  await buscar.fill(SEED.products.iphone.name)
  await expect(page.getByRole('button', { name: new RegExp(SEED.products.iphone.name) }).first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: new RegExp(SEED.products.iphone.name) }).first().click()
  const filaIphone = filas.filter({ hasText: SEED.products.iphone.name })
  await expect(filaIphone).toHaveAttribute('data-estado', 'falta-imei')
  await expect(filaIphone.getByRole('button', { name: /^Elegir IMEI de / })).toContainText('Falta elegir IMEI')

  // Al elegir la unidad la línea queda reservada (chip azul con el serial).
  await filaIphone.getByRole('button', { name: /^Elegir IMEI de / }).click()
  const dialogo = page.getByRole('dialog', { name: /Elegir IMEI/ })
  await dialogo.getByRole('button', { name: 'Reservar este' }).first().click()
  await dialogo.getByRole('button', { name: 'Listo' }).click()
  await expect(filaIphone).toHaveAttribute('data-estado', 'reservado')
  await expect(filaIphone.getByRole('button', { name: /^Cambiar IMEI de / })).toContainText('IMEI •')

  // Descuento de línea: chip ámbar visible con la línea colapsada.
  await filaCable.getByRole('button', { name: /^Ver detalle de / }).click()
  await filaCable.getByLabel(/^Descuento % de /).fill('10')
  await expect(filaCable.getByTestId('linea-descuento')).toContainText('− Gs 4.500')
  await filaCable.getByRole('button', { name: /^Ver menos detalle de / }).click()
  await expect(filaCable.getByTestId('linea-descuento')).toBeVisible()

  // Cupón: chip verde con el código aplicado.
  const codigo = await crearCupon(page)
  await filaIphone.getByRole('button', { name: /^Ver detalle de / }).click()
  await filaIphone.getByRole('button', { name: /^(Aplicar|Cambiar) cupón$/ }).click()
  await filaIphone.getByLabel(/^Código de cupón de /).fill(codigo)
  await filaIphone.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(filaIphone.getByTestId('linea-cupon')).toContainText(codigo)
})

test('los bloques de cobro muestran su estado (pagado / no pagado) (#241)', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente bloques ${Date.now().toString(36)}`)
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()

  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const filaUno = pagos.getByTestId('pago-fila-0')
  await filaUno.getByLabel('Cuenta de cobro').click()
  await page.getByRole('option', { name: /Caja E2E/ }).first().click()
  await filaUno.getByLabel('Monto original').fill('25000')
  await expect(filaUno).toHaveAttribute('data-estado', 'pagado')
  await expect(filaUno).toHaveClass(/mobos-aparece/)

  await page.getByRole('button', { name: /^Dividir saldo/ }).click()
  const filaDos = pagos.getByTestId('pago-fila-1')
  await filaDos.getByLabel('Cuenta de cobro').click()
  await page.getByRole('option', { name: /Caja E2E/ }).first().click()
  await filaDos.getByLabel('Monto original').fill('10000')
  await expect(filaDos).toHaveAttribute('data-estado', 'pagado')

  // Marcar el bloque como no pagado cambia su estado (y su chip).
  await filaDos.getByRole('button', { name: 'Pagado' }).click()
  await expect(filaDos).toHaveAttribute('data-estado', 'no-pagado')
  await expect(filaDos.getByRole('button', { name: 'No pagado' })).toBeVisible()
})
