// #160/#194 — Demo CRM: la venta del POS entra en la ficha del cliente.
// La vista por actividad reciente ordena al cliente con el pedido nuevo arriba
// y los agregados (#221: total gastado, pedidos, última compra), la ficha, la
// cronología y el portal se recalculan desde los pedidos, sin tocar el API.
import { test, expect } from '@playwright/test'

test('demo: la venta del POS actualiza la actividad y los agregados del cliente', async ({ page }) => {
  const apiReal = []
  page.on('request', (request) => {
    if (/\/api\/(customers|orders)/.test(request.url())) apiReal.push(request.url())
  })

  const nav = page.getByTestId('shell-lateral')
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()

  // Estado inicial de Lucía: 5 compras válidas y Gs 7.750.000 (#221).
  await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
  await page.getByLabel('Buscar clientes').fill('Lucía')
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await expect(fila).toContainText('Gs 7.750.000')
  await page.screenshot({ path: '/tmp/qa160-demo-antes.png' })

  // Venta en el POS demo asociada a Lucía (la cartera de seeds se puede elegir).
  await nav.getByRole('button', { name: 'POS', exact: true }).click()
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  const resultado = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: /Funda/i }).first()
  await resultado.click()
  // La cartera demo (seeds #194) se puede buscar y elegir en el POS (#160).
  const campoCliente = page.locator('input[placeholder="Buscar cliente o escribir un nombre nuevo"]')
  await campoCliente.fill('Lucía')
  const sugerencia = page.getByRole('button', { name: /Lucía Fernández/ }).first()
  await expect(sugerencia).toBeVisible()
  await sugerencia.click()
  await expect(page.getByText('Cliente seleccionado')).toBeVisible()
  await expect(page.getByText(/Crédito hasta/)).toBeVisible()

  const principal = page.getByRole('button', { name: /Confirmar venta|Crear pedido/ }).last()
  const etiqueta = (await principal.innerText()).replace(/\s+/g, ' ')
  const monto = Number((etiqueta.match(/[\d.]{4,}/g) || []).join('').replace(/\./g, ''))
  expect(monto, `la venta demo tiene un monto reconocible: "${etiqueta}"`).toBeGreaterThan(0)
  await page.screenshot({ path: '/tmp/qa160-demo-pos.png' })
  await principal.click()
  await expect(page.getByText('Venta registrada').first()).toBeVisible({ timeout: 15000 })

  // CRM: la fila sube por actividad reciente y suma la venta (se espera a que
  // el aviso de demo se desvanezca para que la captura salga limpia).
  await page.waitForTimeout(5000)
  await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
  await page.getByLabel('Buscar clientes').fill('Lucía')
  await expect(fila).toContainText('6')
  const esperado = `Gs ${(7750000 + monto).toLocaleString('es-PY')}`
  await expect(fila).toContainText(esperado)
  await expect(page.getByTestId('cliente-fila').first()).toContainText('Lucía Fernández')
  await page.screenshot({ path: '/tmp/qa160-demo-despues.png' })

  // Ficha: total, deuda del pedido nuevo y últimas órdenes con el número demo.
  await fila.click()
  const ficha = page.getByRole('dialog')
  await expect(ficha.getByText(esperado).first()).toBeVisible()
  await expect(ficha.getByText('Últimas órdenes')).toBeVisible()
  await expect(ficha.getByText(/AUR-#0001/).first()).toBeVisible()
  await expect(ficha.getByText('Última compra')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: '/tmp/qa160-demo-ficha.png' })

  // Cronología: el pedido nuevo queda registrado en el historial del cliente.
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText(/AUR-#0001/).first()).toBeVisible()

  // §19 (#160): el perfil demo completa antigüedad, gastado, órdenes,
  // direcciones (con adicionales), tags, minorista/mayorista y paga impuestos.
  await page.goto('/clientes?cliente=demo-cliente-ramiro')
  const mayorista = page.getByRole('dialog')
  await mayorista.getByText('TOTAL GASTADO').waitFor({ timeout: 20000 })
  const textoMayorista = (await mayorista.innerText()).replace(/\s+/g, ' ')
  await expect(mayorista.getByText('Mayorista').first()).toBeVisible()
  await expect(mayorista.getByText(/Paga impuestos: Sí/)).toBeVisible()
  await expect(mayorista.getByText(/Antigüedad:/)).toBeVisible()
  await expect(mayorista.getByText(/Etiquetas:/)).toBeVisible()
  await expect(mayorista.getByText('reventa').first()).toBeVisible()
  expect(textoMayorista).toMatch(/TOTAL GASTADO Gs [\d.]+/)
  expect(textoMayorista).toMatch(/PEDIDOS \d+/)
  await mayorista.getByRole('tab', { name: /^Resumen/ }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/tmp/qa160-demo-perfil-mayorista.png' })
  await mayorista.getByRole('tab', { name: /^Datos/ }).click()
  const direccionesRamiro = mayorista.getByTestId('perfil-direcciones').locator('li')
  await expect(direccionesRamiro).toHaveCount(2)
  await expect(mayorista.getByTestId('perfil-direcciones')).toContainText('Depósito')
  await mayorista.getByTestId('perfil-direcciones').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/tmp/qa160-demo-perfil-mayorista-direcciones.png' })

  // Lucía también tiene dirección adicional (la ficha muestra las dos).
  await page.goto('/clientes?cliente=demo-cliente-lucia')
  const lucia = page.getByRole('dialog')
  await lucia.getByText('TOTAL GASTADO').waitFor({ timeout: 20000 })
  await expect(lucia.getByText(/Paga impuestos: Sí/)).toBeVisible()
  await expect(lucia.getByText(/Antigüedad:/)).toBeVisible()
  await lucia.getByRole('tab', { name: /^Datos/ }).click()
  await expect(lucia.getByTestId('perfil-direcciones').locator('li')).toHaveCount(2)
  await expect(lucia.getByTestId('perfil-direcciones')).toContainText('Trabajo')
  await lucia.getByTestId('perfil-direcciones').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/tmp/qa160-demo-perfil-lucia-direcciones.png' })

  // Plantilla demo del cliente: se renderiza completa (sin la variable de
  // pedido vacía de las plantillas de órdenes).
  await lucia.getByRole('tab', { name: /^Resumen/ }).click()
  await lucia.getByRole('button', { name: /Elegir plantilla de WhatsApp/ }).click()
  const menuWa = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await menuWa.waitFor({ timeout: 10000 })
  // La vista previa se completa un tick después de abrir el menú: se espera.
  let mensaje = ''
  for (let intento = 0; intento < 20 && !mensaje; intento += 1) {
    mensaje = await menuWa.getByLabel('Mensaje de WhatsApp').inputValue()
    if (!mensaje) await page.waitForTimeout(200)
  }
  expect(mensaje).toMatch(/Lucía Fernández/)
  expect(mensaje).not.toMatch(/Tu pedido\s+ya está/)
  await expect(menuWa.getByText('Saldo pendiente')).toBeVisible()
  await page.screenshot({ path: '/tmp/qa160-demo-whatsapp-cliente.png' })
  await page.keyboard.press('Escape')

  // El portal demo sale como Aurora Móviles y muestra la nota pública sembrada.
  await page.goto('/portal/demo-demo-cliente-lucia-completo')
  await expect(page.getByText('Nota de la tienda')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Gracias por ser parte de Aurora Móviles/)).toBeVisible()
  await expect(page.getByText('MOB-#0008').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/qa160-demo-vitrina-nota.png' })

  expect(apiReal, `la demo no debe llamar al API real: ${apiReal.join(', ')}`).toEqual([])
})
