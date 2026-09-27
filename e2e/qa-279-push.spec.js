// #279 · A1 Web Push: andamiaje de suscripciones. En el arnés no hay claves
// VAPID, así que la API se declara "sin configurar" y la suscripción se prueba
// con un endpoint sintético (alta, listado y baja del propio usuario).
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

test('el andamiaje de Web Push responde y la suscripción se da de alta y baja', async ({ page }) => {
  await page.goto('/resumen')
  await expect(page.getByTestId('shell-perfil')).toBeVisible({ timeout: 20_000 })

  // Sin claves VAPID el panel lo dice; la bandeja interna no depende de esto.
  const clave = await apiPagina(page, '/api/push/clave')
  expect(clave.status).toBe(200)
  expect(clave.body?.configurado).toBe(false)
  expect(clave.body?.clave).toBe('')

  const endpoint = `https://push.ejemplo.invalid/${Date.now()}`
  const alta = await apiPagina(page, '/api/push/suscripciones', {
    method: 'POST',
    body: JSON.stringify({ suscripcion: { endpoint, keys: { p256dh: 'p256dh-demo', auth: 'auth-demo' } }, silencioDesde: 1320, silencioHasta: 420 }),
  })
  expect(alta.status, JSON.stringify(alta.body)).toBe(200)
  expect(alta.body?.ok).toBe(true)

  const listado = await apiPagina(page, '/api/push/suscripciones')
  const dispositivos = listado.body?.dispositivos || []
  const mio = dispositivos.find((fila) => fila.id === alta.body.id)
  expect(mio?.silencioDesde).toBe(1320)
  expect(mio?.silencioHasta).toBe(420)

  // El aviso de prueba avisa que falta configuración (no miente).
  const prueba = await apiPagina(page, '/api/push/prueba', { method: 'POST', body: '{}' })
  expect(prueba.status).toBe(503)

  const baja = await apiPagina(page, '/api/push/suscripciones', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
  expect(baja.status).toBe(200)
  expect(baja.body?.borradas).toBe(1)
  const listadoFinal = await apiPagina(page, '/api/push/suscripciones')
  expect((listadoFinal.body?.dispositivos || []).some((fila) => fila.id === alta.body.id)).toBe(false)

  // Una suscripción inválida se rechaza sin romper.
  const invalida = await apiPagina(page, '/api/push/suscripciones', { method: 'POST', body: JSON.stringify({ suscripcion: { endpoint: 'http://inseguro', keys: {} } }) })
  expect(invalida.status).toBe(400)
})
