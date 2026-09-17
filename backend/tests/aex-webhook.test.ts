import assert from 'node:assert/strict'
import { fechaEventoAex, normalizarEventoWebhook, webhookAutorizado } from '../lib/aex'

// El webhook llega sin sesión: la guía es obligatoria para aceptar el evento.
assert.equal(normalizarEventoWebhook(null), null)
assert.equal(normalizarEventoWebhook({}), null)
assert.equal(normalizarEventoWebhook({ estado: 'En ruta' }), null)
assert.deepEqual(
  normalizarEventoWebhook({
    guia: 'A123456',
    fecha: '2026-09-17 18:05:00',
    codigo_estado: 'E',
    estado: 'Entregado',
    codigo_tipo_evento: 'W5',
    tipo_evento: 'Entrega Realizada',
    observacion: 'Paquete entregado correctamente',
    codigo_operacion_cliente: 'MOBOS-TR-abc123',
  }),
  {
    guia: 'A123456',
    codigoEstado: 'E',
    estado: 'Entregado',
    codigoTipoEvento: 'W5',
    tipoEvento: 'Entrega Realizada',
    observacion: 'Paquete entregado correctamente',
    codigoOperacion: 'MOBOS-TR-abc123',
    fechaEvento: '2026-09-17 18:05:00',
  },
)
// Los estados finales pueden venir sin tipo de evento ni observación.
const final = normalizarEventoWebhook({ guia: 'A1', estado: 'Entregado', codigo_tipo_evento: null, tipo_evento: null, observacion: null })
assert.equal(final?.tipoEvento, '')
assert.equal(final?.observacion, '')
assert.equal(normalizarEventoWebhook({ guia: 'X'.repeat(300) })?.guia.length, 100)

// La fecha de AEX viene en hora local (`YYYY-MM-DD HH:MM:SS`).
assert.equal(fechaEventoAex('2026-09-17 18:05:00')?.toISOString(), new Date('2026-09-17T18:05:00').toISOString())
assert.equal(fechaEventoAex(''), null)
assert.equal(fechaEventoAex('no es fecha'), null)

// El token es opcional: sin configurar se acepta (sandbox) y con token se exige.
delete process.env.MOBOS_AEX_WEBHOOK_TOKEN
assert.equal(webhookAutorizado(new Request('https://x.test', { method: 'POST' })), true)
process.env.MOBOS_AEX_WEBHOOK_TOKEN = 'secreto-123'
const conHeader = (valor: string) => new Request('https://x.test', { method: 'POST', headers: { authorization: valor } })
assert.equal(webhookAutorizado(conHeader('Bearer secreto-123')), true)
assert.equal(webhookAutorizado(conHeader('secreto-123')), true)
assert.equal(webhookAutorizado(conHeader('Bearer otro')), false)
assert.equal(webhookAutorizado(new Request('https://x.test', { method: 'POST' })), false)
delete process.env.MOBOS_AEX_WEBHOOK_TOKEN
