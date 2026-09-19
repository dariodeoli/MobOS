// Accesos públicos del pedido por nivel: cada token autoriza UNA vista
// (rápido | completo | detallado), es no enumerable y se puede regenerar
// invalidando el anterior. El token histórico sigue funcionando como rápido.

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

test('los accesos del pedido respetan el nivel y se pueden regenerar', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const ordenes = await api(page, '/api/orders')
  const pedido = (ordenes.body || []).find(order => order.customer?.name)
  expect(pedido?.id).toBeTruthy()

  const rapido = await api(page, `/api/orders/${pedido.id}/access-tokens`, {
    method: 'POST', body: JSON.stringify({ level: 'rapido' }),
  })
  expect(rapido.status).toBe(200)

  const publicoRapido = await api(page, `/api/orders/public/${rapido.body.token}`)
  expect(publicoRapido.status).toBe(200)
  expect(publicoRapido.body.level).toBe('rapido')
  expect(publicoRapido.body.company?.name).toBeTruthy()
  expect(publicoRapido.body.customer).toBeUndefined()
  expect(typeof publicoRapido.body.pendingPyg).toBe('number')

  // El logo viaja por la vía pública del pedido: con token inválido no se
  // entrega, con token válido responde imagen (o 404 si la empresa no cargó una).
  const logoInvalido = await api(page, '/api/orders/public/token-que-no-existe/logo')
  expect(logoInvalido.status).toBe(404)
  const logoRapido = await api(page, `/api/orders/public/${rapido.body.token}/logo?variant=dark`)
  expect([200, 404]).toContain(logoRapido.status)

  const completo = await api(page, `/api/orders/${pedido.id}/access-tokens`, {
    method: 'POST', body: JSON.stringify({ level: 'completo' }),
  })
  const publicoCompleto = await api(page, `/api/orders/public/${completo.body.token}`)
  expect(publicoCompleto.body.level).toBe('completo')
  expect(publicoCompleto.body.company?.name).toBeTruthy()
  expect(publicoCompleto.body.timeline).toBeUndefined()

  const detallado = await api(page, `/api/orders/${pedido.id}/access-tokens`, {
    method: 'POST', body: JSON.stringify({ level: 'detallado' }),
  })
  const publicoDetallado = await api(page, `/api/orders/public/${detallado.body.token}`)
  expect(publicoDetallado.body.level).toBe('detallado')
  expect(publicoDetallado.body.timeline?.length).toBeGreaterThan(0)

  // El token del QR impreso es propio del papel: el panel no lo lista ni lo
  // revoca cuando regenera sus enlaces.
  const impreso = await api(page, `/api/orders/${pedido.id}/access-tokens`, {
    method: 'POST', body: JSON.stringify({ level: 'rapido', impreso: true }),
  })
  expect(impreso.status).toBe(200)
  expect(impreso.body.token).not.toBe(rapido.body.token)
  const publicoImpreso = await api(page, `/api/orders/public/${impreso.body.token}`)
  expect(publicoImpreso.status).toBe(200)
  const listado = await api(page, `/api/orders/${pedido.id}/access-tokens`)
  expect((listado.body.tokens || []).some(token => token.token === impreso.body.token)).toBe(false)

  // Regenerar invalida el token anterior del mismo nivel (solo el enlace).
  const rotado = await api(page, `/api/orders/${pedido.id}/access-tokens`, {
    method: 'POST', body: JSON.stringify({ level: 'rapido', regenerate: true }),
  })
  expect(rotado.body.token).not.toBe(rapido.body.token)
  const viejo = await api(page, `/api/orders/public/${rapido.body.token}`)
  expect(viejo.status).toBe(404)
  // El QR impreso sigue vivo después de regenerar el enlace del panel.
  const impresoVivo = await api(page, `/api/orders/public/${impreso.body.token}`)
  expect(impresoVivo.status).toBe(200)

  // Un token inventado nunca descubre un pedido.
  const inventado = await api(page, '/api/orders/public/token-que-no-existe')
  expect(inventado.status).toBe(404)

  // La vista pública del nivel abre con el token nuevo.
  await page.goto(`/p/${rotado.body.token}`)
  await expect(page.getByText('Comprobante rápido')).toBeVisible()
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
})
