import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

// Plantillas de mensajes listas contra el API real: la siembra es idempotente,
// trae las versiones de correo (clave email.*, asunto y canal) y una plantilla
// lista que la empresa borra no vuelve a aparecer.
const API = SEED.api

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('siembra idempotente, versión correo y borradas que no se reviven', async ({ page }) => {
  await page.goto('/resumen')
  const primera = await api(page, '/api/message-templates?channel=all')
  expect(primera.status, JSON.stringify(primera.body)).toBe(200)
  const claves = primera.body.map((item) => item.key)
  for (const evento of ['pedido_confirmado', 'sobre_pedido_llego', 'garantia_registrada', 'cotizacion_enviada', 'resena']) {
    expect(claves, evento).toContain(evento)
    const correo = primera.body.find((item) => item.key === `email.${evento}`)
    expect(correo, `correo ${evento}`).toBeTruthy()
    expect(correo.channel).toBe('email')
    expect(correo.subject).toBeTruthy()
  }
  // Sin duplicar al volver a listar.
  const segunda = await api(page, '/api/message-templates?channel=all')
  expect(segunda.body.length).toBe(primera.body.length)
  expect(new Set(segunda.body.map((item) => item.key)).size).toBe(segunda.body.length)

  // Por defecto el listado es de WhatsApp (los consumidores existentes no ven correos).
  const whatsapp = await api(page, '/api/message-templates')
  expect(whatsapp.body.every((item) => item.channel === 'whatsapp')).toBe(true)
  const correos = await api(page, '/api/message-templates?channel=email&category=ORDERS')
  expect(correos.body.length).toBeGreaterThan(0)
  expect(correos.body.every((item) => item.channel === 'email' && item.key.startsWith('email.'))).toBe(true)

  // El correo exige asunto y solo el correo lo lleva.
  const sinAsunto = await api(page, '/api/message-templates', { method: 'POST', body: JSON.stringify({ name: 'Correo sin asunto', body: 'Hola', channel: 'email', category: 'ORDERS' }) })
  expect(sinAsunto.status).toBe(400)

  // Una plantilla lista que se borra no se vuelve a sembrar.
  const resena = segunda.body.find((item) => item.key === 'resena')
  const borrada = await api(page, `/api/message-templates?id=${encodeURIComponent(resena.id)}`, { method: 'DELETE' })
  expect(borrada.status).toBe(200)
  const despues = await api(page, '/api/message-templates?channel=all')
  expect(despues.body.map((item) => item.key)).not.toContain('resena')
  expect(despues.body.length).toBe(primera.body.length - 1)
})
