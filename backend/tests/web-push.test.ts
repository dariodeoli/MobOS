// A1 (#279) · Web Push: piezas puras del andamiaje (silencio, payload genérico
// y configuración). El envío real depende del servicio de push y de VAPID.
import assert from 'node:assert/strict'
import { dentroDeHorarioSilencioso, horaLocalEnMinutos, payloadWebPush, SILENCIO_SUGERIDO, vapidConfig, webPushConfigured } from '../lib/web-push'

// ── Horario silencioso ──────────────────────────────────────────────────────
assert.equal(dentroDeHorarioSilencioso(22 * 60, 7 * 60, 23 * 60), true, '23:00 cae en 22→07')
assert.equal(dentroDeHorarioSilencioso(22 * 60, 7 * 60, 3 * 60), true, 'madrugada cae en 22→07')
assert.equal(dentroDeHorarioSilencioso(22 * 60, 7 * 60, 12 * 60), false, 'mediodía no cae')
assert.equal(dentroDeHorarioSilencioso(9 * 60, 12 * 60, 10 * 60), true, 'ventana normal')
assert.equal(dentroDeHorarioSilencioso(9 * 60, 12 * 60, 12 * 60), false, 'el fin no incluye')
assert.equal(dentroDeHorarioSilencioso(null, 7 * 60, 3 * 60), false, 'sin desde no silencia')
assert.equal(dentroDeHorarioSilencioso(9 * 60, null, 10 * 60), false, 'sin hasta no silencia')
assert.equal(dentroDeHorarioSilencioso(10 * 60, 10 * 60, 10 * 60), false, 'ventana vacía = sin silencio')
assert.deepEqual(SILENCIO_SUGERIDO, { desde: 22 * 60, hasta: 7 * 60 })

// ── Hora local de la tienda (Paraguay, UTC-3/-4 sin DST) ────────────────────
const conHora = (iso: string) => horaLocalEnMinutos(new Date(iso))
assert.equal(conHora('2026-09-27T14:00:00.000Z'), 11 * 60, '14:00Z = 11:00 en Paraguay')
assert.equal(conHora('2026-01-15T14:00:00.000Z'), 11 * 60, 'en enero también (sin DST)')

// ── Payload genérico (nunca datos sensibles) ────────────────────────────────
const payload = JSON.parse(payloadWebPush({ titulo: 'Novedad', cuerpo: 'Hay algo nuevo', url: '/pedidos/123', tag: 'pedido-1' }))
assert.deepEqual(payload, { titulo: 'Novedad', cuerpo: 'Hay algo nuevo', url: '/pedidos/123', tag: 'pedido-1' })
assert.equal(JSON.parse(payloadWebPush({})).titulo, 'Tenés una novedad en MobOS', 'siempre hay título genérico')
assert.equal(JSON.parse(payloadWebPush({ url: 'https://otro-sitio/x' })).url, '/', 'solo rutas internas')
assert.ok(payloadWebPush({ cuerpo: 'x'.repeat(400) }).length < 400, 'el cuerpo se recorta')
// El texto genérico lo garantiza quien llama: los eventos de fase 2 no pasan
// nombres, montos ni IMEI (ver docs/WEB-PUSH.md, «Sin datos sensibles»).

// ── Configuración ───────────────────────────────────────────────────────────
const antes = { publica: process.env.VAPID_PUBLIC_KEY, privada: process.env.VAPID_PRIVATE_KEY, sujeto: process.env.VAPID_SUBJECT }
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT
assert.equal(webPushConfigured(), false, 'sin claves no está configurado')
assert.equal(vapidConfig(), null)
process.env.VAPID_PUBLIC_KEY = 'clave-publica-demo'; process.env.VAPID_PRIVATE_KEY = 'clave-privada-demo'
const config = vapidConfig()
assert.equal(config?.publicKey, 'clave-publica-demo')
assert.equal(config?.subject, 'mailto:soporte@moboss.online', 'sujeto por defecto')
if (antes.publica === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = antes.publica
if (antes.privada === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = antes.privada
if (antes.sujeto === undefined) delete process.env.VAPID_SUBJECT; else process.env.VAPID_SUBJECT = antes.sujeto

console.log('web-push: silencio, payload y configuración ok')
