#!/usr/bin/env node
// Prueba de ENVÍOS contra el SANDBOX de AEX (#3), con datos ficticios:
// autorizar → cotizar → generar UNA guía → consultar seguimiento.
//
// Usa el adaptador real (backend/lib/aex.ts) y las credenciales locales de
// backend/.env (gitignored):
//   MOBOS_AEX_PUBLIC_KEY=…
//   MOBOS_AEX_PRIVATE_KEY=…
//   MOBOS_AEX_API_URL=https://sandbox.aex.com.py/api/v1
//
// Seguridad: solo sandbox. Si la URL no es de sandbox el script se niega a
// correr (salvo MOBOS_AEX_PERMITIR_PRODUCCION=1, no recomendado). No toca
// Coolify, el webhook de producción ni datos reales.
//
// Uso: npm run aex:sandbox
// Modo sin claves: `node scripts/aex-sandbox-prueba.mjs --simulado` ejercita el
// mismo flujo con respuestas sandbox simuladas (para validar el harness).

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Carga backend/.env sin pisar variables ya presentes en el entorno.
try {
  for (const linea of readFileSync(join(raiz, 'backend/.env'), 'utf8').split(/\r?\n/)) {
    const match = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || !match[2] || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
  }
} catch { /* sin backend/.env: se usan las variables del entorno */ }

// --simulado: mismas llamadas y mismo adaptador, con respuestas del sandbox
// simuladas en memoria. Sirve para probar el harness sin credenciales.
const simulado = process.argv.includes('--simulado')
if (simulado) {
  process.env.MOBOS_AEX_PUBLIC_KEY ||= 'sandbox-publica-simulada'
  process.env.MOBOS_AEX_PRIVATE_KEY ||= 'sandbox-privada-simulada'
  process.env.MOBOS_AEX_API_URL ||= 'https://sandbox.aex.com.py/api/v1'
  globalThis.fetch = async (url, opciones = {}) => {
    const responder = (datos) => new Response(JSON.stringify(datos), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const ruta = String(url)
    const cuerpo = JSON.parse(String(opciones.body || '{}'))
    if (ruta.includes('/autorizacion-acceso/generar')) return responder({ codigo_autorizacion: 'token-simulado' })
    if (ruta.includes('/envios/ciudades')) return responder({ datos: [{ codigo_ciudad: 'ASU', denominacion: 'Asunción' }, { codigo_ciudad: 'CDE', denominacion: 'Ciudad del Este' }] })
    if (ruta.includes('/envios/calcular')) return responder({ datos: [{ id_tipo_servicio: 7, tipo_servicio: 'Estándar simulado', costo_flete: 45000, tiempo_entrega: 24 }] })
    if (ruta.includes('/envios/solicitar_servicio')) return responder({ datos: { id_solicitud: 12345 } })
    if (ruta.includes('/envios/confirmar_servicio')) return responder({ datos: { numero_guia: `SIM-${String(cuerpo.codigo_operacion || 'X')}` } })
    if (ruta.includes('/envios/tracking')) return responder({ datos: [{ fecha: '2026-09-21 10:00:00', estado: 'En tránsito (simulado)', tipo_evento: 'Movimiento', observacion: 'Evento simulado del harness' }] })
    return new Response(JSON.stringify({ mensaje: 'ruta no simulada' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

const apiUrl = String(process.env.MOBOS_AEX_API_URL || '').trim()
const publicKey = String(process.env.MOBOS_AEX_PUBLIC_KEY || '').trim()
const privateKey = String(process.env.MOBOS_AEX_PRIVATE_KEY || '').trim()

// Importar el adaptador no hace llamadas: recién se ejecuta con credenciales.
const { aexConfigurado, aexQuote, aexShip, aexTracking } = await import('../backend/lib/aex.ts')

if (!aexConfigurado() || !publicKey || !privateKey) {
  console.error('✖ Faltan las claves sandbox de AEX en backend/.env (las tiene Dario por correo):')
  console.error('    MOBOS_AEX_PUBLIC_KEY=<clave pública sandbox>')
  console.error('    MOBOS_AEX_PRIVATE_KEY=<clave privada sandbox>')
  console.error('    MOBOS_AEX_API_URL=https://sandbox.aex.com.py/api/v1')
  console.error('  También podés pasarlas por entorno al correr el script.')
  console.error('  No se hizo ninguna llamada.')
  process.exit(2)
}

if (!/sandbox\.aex\.com\.py/i.test(apiUrl) && process.env.MOBOS_AEX_PERMITIR_PRODUCCION !== '1') {
  console.error(`✖ MOBOS_AEX_API_URL no apunta al sandbox: ${apiUrl || '(vacía)'}`)
  console.error('  Este harness es solo sandbox. Para producción (no recomendado): MOBOS_AEX_PERMITIR_PRODUCCION=1.')
  process.exit(1)
}

// Datos ficticios de la prueba: ningún cliente ni dirección real.
const origen = 'Asunción'
const destino = 'Ciudad del Este'
const pesoKg = 1
const codigoOperacion = `MOBOS-SANDBOX-${randomUUID().slice(0, 8)}`
const direccionOrigen = 'Calle Ficticia 123 (sandbox MOBOS)'
const direccionDestino = 'Avenida de Prueba 456 (sandbox MOBOS)'

const resumen = { entorno: apiUrl, requestId: codigoOperacion, origen, destino, pesoKg, cotizaciones: null, guia: null, costoPyg: null, servicio: null, seguimiento: null }

console.log(`AEX sandbox · ${apiUrl}`)
console.log(`requestId (codigo_operacion): ${codigoOperacion}`)

const cotizaciones = await aexQuote(origen, destino, pesoKg)
if (!cotizaciones || !cotizaciones.length) {
  console.error('✖ La cotización no devolvió servicios (credenciales rechazadas, sandbox sin cobertura o ciudad inexistente). No se generó guía.')
  process.exit(3)
}
resumen.cotizaciones = cotizaciones
console.log(`\nCotización ${origen} → ${destino} (${pesoKg} kg):`)
for (const cotizacion of cotizaciones) {
  console.log(`  · [${cotizacion.serviceId}] ${cotizacion.serviceName}: Gs. ${cotizacion.costPyg.toLocaleString('es-PY')}${cotizacion.deliveryHours ? ` · ${cotizacion.deliveryHours} h` : ''}`)
}

// UNA sola guía ficticia.
const envio = await aexShip(origen, destino, pesoKg, codigoOperacion, direccionOrigen, direccionDestino)
if (!envio) {
  console.error('✖ No se pudo generar la guía ficticia (solicitar_servicio/confirmar_servicio falló).')
  process.exit(4)
}
resumen.guia = envio.guide
resumen.costoPyg = envio.costPyg
resumen.servicio = envio.serviceName
console.log(`\nGuía ficticia generada: ${envio.guide} · ${envio.serviceName} · Gs. ${envio.costPyg.toLocaleString('es-PY')}`)

const eventos = await aexTracking(envio.guide)
resumen.seguimiento = eventos
if (eventos === null) console.log('Seguimiento: sin datos todavía (la guía recién creada puede no tener eventos).')
else if (!eventos.length) console.log('Seguimiento: sin eventos por ahora.')
else {
  console.log(`\nSeguimiento (${eventos.length} eventos):`)
  for (const evento of eventos.slice(0, 5)) console.log(`  · ${evento.fecha} · ${evento.estado}${evento.observacion ? ` — ${evento.observacion}` : ''}`)
}

console.log('\nResumen JSON (para el handover):')
console.log(JSON.stringify(resumen, null, 2))
