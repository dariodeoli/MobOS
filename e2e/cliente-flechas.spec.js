// Ficha de cliente: las flechas anterior/siguiente cambian de cliente en el orden de la lista.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

test('ficha: siguiente cambia de cliente y anterior vuelve', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await page.goto('/clientes')
  const filas = page.getByTestId('cliente-fila')
  await expect(filas.first()).toBeVisible()
  const nombres = await filas.evaluateAll((els) => els.slice(0, 2).map((el) => el.textContent))
  await filas.first().click()
  const ficha = page.getByRole('dialog', { name: /^Cliente: / })
  const titulo = ficha.getByRole('heading', { level: 3 })
  await expect(ficha.getByRole('button', { name: 'Cliente anterior' })).toBeDisabled()
  const primero = (await titulo.textContent()).trim()
  expect(nombres[0]).toContain(primero)
  await ficha.getByRole('button', { name: 'Cliente siguiente' }).click()
  await expect(titulo).not.toHaveText(primero)
  const segundo = (await titulo.textContent()).trim()
  expect(nombres[1]).toContain(segundo)
  await ficha.getByRole('button', { name: 'Cliente anterior' }).click()
  await expect(titulo).toHaveText(primero)
})
