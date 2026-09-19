// Prueba del webhook de AEX: manda un evento de seguimiento de muestra al
// receptor de MobOS y verifica que responda 2xx con {"isSuccess": true}.
//
// Uso:
//   MOBOS_AEX_WEBHOOK_TOKEN=<token> MOBOS_AEX_WEBHOOK_HEADER=tokenUnicoAexprueba \
//   MOBOS_AEX_WEBHOOK_URL=https://api.moboss.online/api/aex/webhook \
//   node scripts/aex-webhook-prueba.mjs
//
// El token viaja solo por variables de entorno; nunca se escribe en código,
// logs ni salidas. Con --aviso imprime el texto listo para enviarle a AEX.

const url = process.env.MOBOS_AEX_WEBHOOK_URL || 'https://api.moboss.online/api/aex/webhook'
const header = process.env.MOBOS_AEX_WEBHOOK_HEADER || 'tokenUnicoAexprueba'
const token = process.env.MOBOS_AEX_WEBHOOK_TOKEN || ''

if (process.argv.includes('--aviso')) {
  console.log(`
Para AEX (aviso de prueba):

  Proveedor: AEX
  Webhook URL: ${url}
  Método: POST
  Header: ${header}: <token acordado>

  Payload de ejemplo (JSON):

  {
    "guia": "A000000001",
    "fecha": "2026-09-18 10:30:00",
    "codigo_estado": "T",
    "estado": "En tránsito",
    "codigo_tipo_evento": "W1",
    "tipo_evento": "Movimiento registrado",
    "observacion": "Paquete en ruta",
    "codigo_operacion_cliente": "MOBOS-PRUEBA"
  }

  MobOS responde 200 con {"isSuccess": true}. Ante cualquier 2xx AEX no
  reintenta; si devuelve 4xx, AEX reintenta hasta 4 veces.
`)
  process.exit(0)
}

if (!token) {
  console.error('Falta MOBOS_AEX_WEBHOOK_TOKEN (el token acordado con AEX).')
  process.exit(1)
}

const evento = {
  guia: 'A000000001',
  fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
  codigo_estado: 'T',
  estado: 'En tránsito',
  codigo_tipo_evento: 'W1',
  tipo_evento: 'Movimiento registrado (prueba)',
  observacion: 'Evento de prueba enviado para verificar el webhook.',
  codigo_operacion_cliente: 'MOBOS-PRUEBA',
}

const control = new AbortController()
const timer = setTimeout(() => control.abort(), 15000)
try {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [header]: token },
    body: JSON.stringify(evento),
    signal: control.signal,
  })
  const cuerpo = await respuesta.text()
  console.log(`HTTP ${respuesta.status}`)
  console.log(cuerpo)
  if (respuesta.status >= 200 && respuesta.status < 300) {
    console.log('✓ El receptor de MobOS aceptó el evento. Avisale a AEX que carguen los movimientos.')
  } else {
    console.log('✗ El receptor no aceptó el evento. Revisá el token, el header y que el deploy esté al día.')
  }
} catch (cause) {
  console.error('No se pudo alcanzar el webhook:', cause?.message || cause)
  process.exit(1)
} finally {
  clearTimeout(timer)
}
