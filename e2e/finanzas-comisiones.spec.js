// Comisiones: las reglas viven en Finanzas → Comisiones y ya no en
// Configuración → Equipo; se pueden crear, editar y eliminar desde ahí (#56).

import { test, expect } from '@playwright/test'
import { crearIntegranteConPinLibre } from './helpers/integrantes.mjs'
import { periodoPendiente } from '../src/utils/comisionesPeriodo.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('reglas de comisión en Finanzas', () => {
  test('Configuración ya no las muestra y Finanzas → Comisiones permite editarlas', async ({ page }) => {
    const nombre = `Integrante Comisiones ${Date.now().toString(36)}`
    await page.goto('/configuracion/equipo')
    const creado = await crearIntegranteConPinLibre(page, { api: API, nombre })
    expect(creado?.id).toBeTruthy()
    // El usuario se creó con un fetch directo (no invalida la caché corta del
    // cliente). Recargamos para que Comisiones lea /api/users fresco y el
    // buscador de vendedores incluya al integrante recién creado.
    await page.reload()

    // Configuración → Equipo solo avisa dónde viven ahora.
    await expect(page.getByRole('heading', { name: 'Comisiones' })).toBeVisible()
    await expect(page.getByText(/Finanzas → Comisiones/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ir a Finanzas → Comisiones' }).click()
    await expect(page).toHaveURL(/\/finanzas\/comisiones$/)
    await expect(page.getByRole('heading', { name: 'Comisiones', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toBeVisible()

    // Crear una regla para el integrante dedicado (sin colisiones con seeds).
    const vendedorBusqueda = page.getByRole('combobox', { name: 'Vendedor de la regla' })
    await vendedorBusqueda.fill(nombre)
    await page.getByRole('option', { name: new RegExp(nombre) }).click()
    await page.getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('0,5')
    await page.getByRole('button', { name: 'Agregar regla' }).click()
    await expect(page.getByText('Regla de comisión creada.')).toBeVisible()
    const regla = () => page.getByTestId('regla-comision').filter({ hasText: nombre }).first()
    await expect(regla().getByText('0,5%')).toBeVisible()

    // Editar el porcentaje.
    await regla().getByTitle('Editar porcentaje').click()
    await regla().getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('1,5')
    await regla().getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Regla de comisión actualizada.')).toBeVisible()
    await expect(regla().getByText('1,5%')).toBeVisible()

    // Eliminar con confirmación.
    await regla().getByTitle('Eliminar regla').click()
    await page.getByRole('dialog', { name: '¿Eliminar regla?' }).getByRole('button', { name: 'Eliminar regla' }).click()
    await expect(page.getByText('Regla de comisión eliminada.')).toBeVisible()
    await expect(page.getByTestId('regla-comision').filter({ hasText: nombre })).toHaveCount(0)

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
  })

  // #83 · Comisiones al día: el período de la liquidación arranca donde terminó
  // el último corte vigente del vendedor (antes arrancaba al inicio del mes y
  // chocaba con el corte anterior: el servidor rechaza superposiciones).
  test('la liquidación arranca donde terminó el último corte del vendedor', async ({ page }) => {
    await page.goto('/finanzas/comisiones')
    await expect(page.getByRole('heading', { name: 'Comisiones', level: 2 })).toBeVisible()

    const buscador = page.getByRole('combobox', { name: 'Vendedor de la liquidación' })
    const usuarios = await page.evaluate(async (api) => (await fetch(`${api}/api/users`, { credentials: 'include' })).json(), API)
    const vendedor = (usuarios || []).find((fila) => String(fila.name || '').startsWith('Administrador'))
    expect(vendedor?.id, 'el seed trae al Administrador').toBeTruthy()
    await buscador.fill(vendedor.name)
    await page.getByRole('option', { name: new RegExp(vendedor.name) }).first().click()

    // La expectativa sale de los cortes reales del vendedor, con el mismo
    // cálculo puro que usa la pantalla.
    const hoy = await page.evaluate(() => {
      const fecha = new Date()
      return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
    })
    const cortes = await page.evaluate(
      async ({ api, id }) => (await fetch(`${api}/api/commission-settlements?sellerId=${id}`, { credentials: 'include' })).json(),
      { api: API, id: vendedor.id },
    )
    const esperado = periodoPendiente(cortes, { sellerId: vendedor.id, hoy, inicioMes: `${hoy.slice(0, 7)}-01` })

    await expect(page.getByLabel('Desde')).toHaveValue(esperado.desde)
    if (esperado.alDia) {
      await expect(page.getByText(/Sin comisiones pendientes/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cerrar liquidación' })).toBeDisabled()
    } else {
      await expect(page.getByText(/Se liquida desde el/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cerrar liquidación' })).toBeEnabled()
    }
  })
})
