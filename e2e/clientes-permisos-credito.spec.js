// [PERM] Límite de crédito, plazo y tipo comercial (mayorista) son de gerencia/dueño:
// un vendedor que los manda por la API recibe 403 y la ficha no cambia; el contacto
// sí lo puede editar (200). El dueño cambia el crédito (200).
import { test, expect } from '@playwright/test'
import { contextoVendedorApi } from './helpers/seller-api.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test('el vendedor edita contacto pero no crédito ni tipo comercial', async ({ page }) => {
  await page.goto('/resumen')
  const origen = new URL(page.url()).origin
  const dueno = (ruta, metodo, data) => page.request.fetch(`${API}${ruta}`, { method: metodo, data, headers: { origin: origen } })
  const sufijo = Date.now().toString(36)
  const creado = await dueno('/api/customers', 'POST', { name: `Permisos Crédito ${sufijo}`, phone: `0983${String(Date.now()).slice(-6)}` })
  expect(creado.status()).toBe(201)
  const id = (await creado.json()).id

  const vendedor = await contextoVendedorApi({ origen })
  const patch = (data) => vendedor.fetch(`/api/customers/${encodeURIComponent(id)}`, { method: 'PATCH', data })
  try {
    // Crédito y tipo comercial: 403 y nada se escribe.
    for (const cambio of [{ creditLimitPyg: 9000000 }, { creditDays: 45 }, { pricingTier: 'WHOLESALE' }, { creditTolerancePct: 30 }]) {
      const respuesta = await patch(cambio)
      expect(respuesta.status(), `vendedor ${Object.keys(cambio)[0]}`).toBe(403)
    }
    let ficha = await (await dueno(`/api/customers/${encodeURIComponent(id)}`, 'GET')).json()
    expect(ficha.customer.creditLimitPyg ?? 0).toBe(0)
    expect(ficha.customer.pricingTier).not.toBe('WHOLESALE')

    // Contacto: permitido.
    const contacto = await patch({ email: `permisos-${sufijo}@ejemplo.com` })
    expect(contacto.status()).toBe(200)

    // Dueño: puede.
    const habilitado = await dueno(`/api/customers/${encodeURIComponent(id)}`, 'PATCH', { creditLimitPyg: 9000000, pricingTier: 'WHOLESALE' })
    expect(habilitado.status()).toBe(200)
    ficha = await (await dueno(`/api/customers/${encodeURIComponent(id)}`, 'GET')).json()
    expect(ficha.customer.creditLimitPyg).toBe(9000000)
    expect(ficha.customer.pricingTier).toBe('WHOLESALE')
  } finally {
    await vendedor.dispose()
  }
})
