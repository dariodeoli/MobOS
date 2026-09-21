// Configuración → Equipo: ficha del integrante con foto/iniciales, cambio de
// rol con confirmación y auditoría, historial abierto desde la fila y
// desactivación/reactivación explícitas que conservan el historial (issue #55).

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearIntegrante(page, nombre, pin, extra = {}) {
  return page.evaluate(
    async ({ api, nombre, pin, extra }) => {
      const response = await fetch(`${api}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nombre, pin, role: 'VENDEDOR', ...extra }),
      })
      return response.json()
    },
    { api: API, nombre, pin, extra },
  )
}

test.describe('ficha del integrante en Equipo', () => {
  test('cada integrante muestra iniciales, correo, rol e historial', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    const fila = page.getByTestId('integrante-fila').filter({ hasText: SEED.sellers[0].name }).first()
    await expect(fila).toBeVisible()
    await expect(fila.getByText('VU')).toBeVisible() // iniciales de Vendedor E2E Uno
    // La identidad la pinta el Avatar compartido (foto subida → Google → iniciales).
    await expect(fila.locator(`[title="${SEED.sellers[0].name}"]`)).toBeVisible()
    await expect(fila.getByRole('combobox', { name: `Rol de ${SEED.sellers[0].name}` })).toHaveValue('VENDEDOR')
    await expect(fila.getByRole('button', { name: `Historial de ${SEED.sellers[0].name}` })).toBeVisible()
    await expect(fila.getByRole('button', { name: `Horario de ${SEED.sellers[0].name}` })).toBeVisible()
  })

  test('la ficha usa el Avatar compartido y muestra la sucursal del integrante', async ({ page }) => {
    const stamp = Date.now().toString(36)
    const nombre = `Avatar E2E ${stamp}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    const nombreSucursal = `Sucursal avatar ${stamp}`
    await page.goto('/configuracion/equipo')

    const sucursal = await page.evaluate(
      async ({ api, nombreSucursal }) => {
        const response = await fetch(`${api}/api/branches`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nombreSucursal }),
        })
        return response.json()
      },
      { api: API, nombreSucursal },
    )
    expect(sucursal?.id).toBeTruthy()

    const creado = await crearIntegrante(page, nombre, pin, { branchId: sucursal.id })
    expect(creado?.id).toBeTruthy()
    await page.reload()

    const fila = () => page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(fila()).toBeVisible()
    // Sin foto subida el Avatar cae a las iniciales y la sucursal se resuelve por nombre.
    await expect(fila().locator(`span[title="${nombre}"]`)).toBeVisible()
    await expect(fila().locator(`img[alt="Foto de ${nombre}"]`)).toHaveCount(0)
    await expect(fila().getByText(nombreSucursal)).toBeVisible()

    // Con foto subida (PNG 1x1 válido por magic bytes) el Avatar la prioriza.
    const subida = await page.evaluate(
      async ({ api, id }) => {
        const bytes = Uint8Array.from(
          atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
          (caracter) => caracter.charCodeAt(0),
        )
        const form = new FormData()
        form.append('avatar', new Blob([bytes], { type: 'image/png' }), 'avatar.png')
        const response = await fetch(`${api}/api/users/${id}/avatar`, { method: 'POST', credentials: 'include', body: form })
        return response.status
      },
      { api: API, id: creado.id },
    )
    expect(subida).toBe(200)
    await page.reload()
    await expect(fila().locator(`img[alt="Foto de ${nombre}"]`)).toBeVisible()
    await expect(fila().locator(`span[title="${nombre}"]`)).toHaveCount(0)

    // Limpieza: sin foto y desactivado, la ficha vuelve a las iniciales.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users/${id}/avatar`, { method: 'DELETE', credentials: 'include' })
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
    await page.reload()
    await page.getByRole('tab', { name: /^Inactivos/ }).click()
    await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre }).first().locator(`span[title="${nombre}"]`)).toBeVisible()
  })

  test('cambiar el rol se refleja, queda auditado y desactivar/reactivar conserva el historial', async ({ page }) => {
    const nombre = `Integrante E2E ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    await page.goto('/configuracion/equipo')
    const creado = await crearIntegrante(page, nombre, pin)
    expect(creado?.id).toBeTruthy()
    await page.reload()

    const fila = () => page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(fila()).toBeVisible()

    // Cambio de rol con confirmación desde la propia fila.
    await fila().getByRole('combobox', { name: `Rol de ${nombre}` }).selectOption('CAJERA')
    const cambiar = page.getByRole('dialog', { name: '¿Cambiar el rol del integrante?' })
    await expect(cambiar).toContainText('Vendedor')
    await expect(cambiar).toContainText('Cajera')
    await cambiar.getByRole('button', { name: 'Cambiar rol' }).click()
    await expect(page.getByText('Rol actualizado a Cajera.')).toBeVisible()
    await expect(fila().getByRole('combobox', { name: `Rol de ${nombre}` })).toHaveValue('CAJERA')

    // El historial existente (backend) se abre desde la ficha y trae el cambio auditado.
    await fila().getByRole('button', { name: `Historial de ${nombre}` }).click()
    const historial = page.getByRole('dialog', { name: `Historial de ${nombre}` })
    await expect(historial).toBeVisible()
    await expect(historial.getByText(/Rol: Vendedor → Cajera/)).toBeVisible()
    await historial.getByRole('button', { name: 'Cerrar' }).click()
    await expect(historial).toBeHidden()

    // Desactivar: explícito sobre el historial y con confirmación.
    await fila().getByRole('button', { name: `Desactivar a ${nombre} (conserva el historial)` }).click()
    const baja = page.getByRole('dialog', { name: '¿Desactivar integrante?' })
    await expect(baja).toContainText('historial')
    await expect(baja).toContainText('reactivarlo')
    await baja.getByRole('button', { name: 'Desactivar integrante' }).click()
    await expect(page.getByText('Integrante desactivado; su historial se conserva.')).toBeVisible()
    await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre })).toHaveCount(0)

    // Reactivar desde el filtro de inactivos.
    await page.getByRole('tab', { name: /^Inactivos/ }).click()
    const inactivo = page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(inactivo.getByText('Inactivo')).toBeVisible()
    await inactivo.getByRole('button', { name: `Volver a activar a ${nombre}` }).click()
    await expect(page.getByText(new RegExp(`${nombre} vuelve a estar activo`))).toBeVisible()
    await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre }).first().getByText('Activo')).toBeVisible()

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
  })

  // #159: PIN de 4 a 6 dígitos, generado al azar o definido a mano; el valor
  // guardado nunca se muestra y el nuevo PIN sirve para entrar al POS.
  test('el PIN del integrante se genera, se asigna y sirve para entrar', async ({ page, browser }) => {
    const nombre = `PIN E2E ${Date.now().toString(36)}`
    const pinViejo = String(1000 + Math.floor(Math.random() * 9000))
    await page.goto('/configuracion/equipo')
    const creado = await crearIntegrante(page, nombre, pinViejo)
    expect(creado?.id).toBeTruthy()
    await page.reload()

    const fila = page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(fila).toBeVisible()
    await fila.getByRole('button', { name: `PIN de ${nombre}` }).click()

    const dialogo = page.getByRole('dialog', { name: `PIN de ${nombre}` })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByText(/nunca se puede ver/)).toBeVisible()
    await dialogo.getByRole('button', { name: 'Generar PIN' }).click()
    const generado = ((await dialogo.getByTestId('pin-generado').textContent()) || '').trim()
    expect(generado).toMatch(/^\d{4,6}$/)
    await dialogo.getByRole('button', { name: 'Asignar PIN' }).click()
    await expect(page.getByText(new RegExp(`PIN asignado a ${nombre}`))).toBeVisible()

    // El PIN nuevo entra por el endpoint de operador; el viejo ya no sirve.
    // Se prueba en un contexto aparte para no cambiar la sesión de esta página.
    const contexto = await browser.newContext({ storageState: new URL('./.auth/admin.json', import.meta.url).pathname })
    const pinPage = await contexto.newPage()
    try {
      await pinPage.goto('/login')
      const probar = (pin) => pinPage.evaluate(async ({ api, id, pin }) => {
        const res = await fetch(`${api}/api/auth/pin`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sellerId: id, pin }) })
        return res.status
      }, { api: API, id: creado.id, pin })
      expect(await probar(pinViejo)).toBe(401)
      expect(await probar(generado)).toBe(200)
    } finally {
      await contexto.close()
    }

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(async ({ api, id }) => {
      await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
    }, { api: API, id: creado.id })
  })
})
