// Campañas de recompra (#82) sobre datos reales: la pestaña lista el segmento
// de inactivos, el consentimiento habilita el envío y al abrir WhatsApp la
// ficha queda marcada como contactada.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la sección Campañas lista el segmento y marca el contacto en la ficha', async ({ page }) => {
  // Navegar primero: el fetch del helper sale del origen de la app (about:blank
  // no puede llamar a la API).
  await page.goto('/clientes')
  const marca = Date.now()
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Campaña E2E ${marca}`, phone: `59598${String(marca).slice(-7)}`, countryCode: '+595', acceptsWhatsappMarketing: true }),
  })
  expect(cliente.status).toBe(201)

  await page.getByRole('button', { name: 'Campañas' }).click()
  await expect(page.getByRole('heading', { name: 'Campañas de recompra' })).toBeVisible()

  // La plantilla de clientes se siembra sola y la vista previa usa el nombre.
  await expect(page.getByLabel('Plantilla de la campaña')).toHaveValue(/.+/)
  await expect(page.getByLabel('Vista previa del mensaje')).toContainText('Campaña')

  // El cliente sin pedidos entra al segmento por defecto de inactivos.
  const fila = page.getByRole('listitem').filter({ hasText: cliente.body.name })
  await expect(fila).toBeVisible()
  await expect(fila.getByRole('button', { name: 'WhatsApp' })).toBeEnabled()

  // Abrir WhatsApp no debe salir a la red real en el test: se aborta el enlace.
  await page.context().route('https://wa.me/**', (route) => route.abort())
  await fila.getByRole('button', { name: 'WhatsApp' }).click()
  await expect(fila.getByText(/^Contactado /)).toBeVisible()

  // La marca quedó persistida en el backend (la UI la muestra optimista: se
  // reintenta leer el segmento hasta que el POST termine).
  await expect.poll(async () => {
    const segmento = await api(page, '/api/customers/segments?segment=inactivos6m')
    const guardado = (segmento.body?.customers || []).find((row) => row.id === cliente.body.id)
    return guardado?.marketingContactedAt || null
  }, { timeout: 5000 }).toBeTruthy()
})
