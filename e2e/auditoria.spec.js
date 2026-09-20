// Auditoría central (Configuración → Seguridad → Historial): búsqueda que
// alcanza el metadato, filtros de fecha y actor, y exportación CSV con los
// mismos filtros. El rastro se genera contra la API real, no con datos de demo.

import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('auditoría', () => {
  test('busca en el detalle, filtra por fecha y actor y exporta el CSV', async ({ page }) => {
    await page.goto('/configuracion/historial')
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible()
    await expect(page.getByTestId('auditoria-tabla')).toBeVisible()

    // Alta real de una impresora: el destino solo vive en el metadato del evento.
    const marca = Date.now()
    const nombre = `Impresora Auditoría E2E ${marca}`
    const destino = `cups:AUD_E2E_${marca}`
    const alta = await page.evaluate(
      async ({ api, nombre, destino }) => {
        const respuesta = await fetch(`${api}/api/print/printers`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nombre, destination: destino }),
        })
        return { status: respuesta.status, payload: await respuesta.json().catch(() => null) }
      },
      { api: API, nombre, destino },
    )
    expect(alta.status, JSON.stringify(alta.payload)).toBe(201)

    const fila = page.getByTestId('auditoria-fila').filter({ hasText: destino }).first()

    // La búsqueda promete identificadores del detalle: el destino está en el metadato.
    await page.getByLabel('Buscar en la auditoría').fill(destino)
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('Impresora creada')
    await expect(fila).toContainText('Impresiones')

    // Rango de fecha: el movimiento es de hoy.
    await page.getByLabel('Filtrar por fecha').selectOption('hoy')
    await expect(fila).toBeVisible()

    // Actor: el admin hizo el alta.
    await page.getByLabel('Filtrar por actor').selectOption({ label: 'Administrador' })
    await expect(fila).toBeVisible()

    // El CSV aplica los mismos filtros y sale con etiquetas legibles.
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ])
    const contenido = (await readFile(await descarga.path(), 'utf8')).replace(/^\uFEFF/, '')
    expect(contenido.split('\r\n')[0]).toBe('Fecha;Acción;Actor;Área;Entidad/ID;Detalle')
    expect(contenido).toContain('Impresora creada')
    expect(contenido).toContain('Impresiones')
    expect(contenido).toContain(destino)

    // Limpieza: la baja también deja rastro y no ensucia corridas siguientes.
    const baja = await page.evaluate(
      async ({ api, id }) => {
        const respuesta = await fetch(`${api}/api/print/printers/${id}`, { method: 'DELETE', credentials: 'include' })
        return respuesta.status
      },
      { api: API, id: alta.payload.id },
    )
    expect(baja).toBe(200)
  })
})
