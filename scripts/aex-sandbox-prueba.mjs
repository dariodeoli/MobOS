#!/usr/bin/env node
// Prueba de ENVÍOS contra el SANDBOX de AEX (#3), con datos ficticios.
//
// Modos:
//   node scripts/aex-sandbox-prueba.mjs --consulta <codigo_operacion>
//       Consulta SOLO LECTURA del tracking por código de operación (no crea nada).
//   node scripts/aex-sandbox-prueba.mjs
//       Diagnóstico: config, autorización, ciudades y cotización. No crea guía.
//   node scripts/aex-sandbox-prueba.mjs --crear-guia
//       Crea UNA sola guía ficticia (requiere OK explícito; equivale a MOBOS_AEX_OK=1).
//   node scripts/aex-sandbox-prueba.mjs --simulado [--crear-guia]
//       Ejercita el mismo flujo con respuestas sandbox simuladas (sin red).
//
// Credenciales (backend/.env local, gitignored):
//   MOBOS_AEX_PUBLIC_KEY / MOBOS_AEX_PRIVATE_KEY
//   MOBOS_AEX_API_URL=https://sandbox.aex.com.py/api/v1
//
// Seguridad: solo sandbox (salvo MOBOS_AEX_PERMITIR_PRODUCCION=1). Cada etapa
// muestra el código y el mensaje de AEX tal cual; nunca se inventa una guía.

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

const argumentos = process.argv.slice(2)
const valorDe = (bandera) => {
  const i = argumentos.indexOf(bandera)
  return i >= 0 ? String(argumentos[i + 1] || '').trim() : ''
}
const simulado = argumentos.includes('--simulado')
const crearGuia = argumentos.includes('--crear-guia') || String(process.env.MOBOS_AEX_OK || '') === '1'
const consultaOperacion = valorDe('--consulta')

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
    if (ruta.includes('/envios/solicitar_servicio')) return responder({ datos: [{ id_solicitud: 12345, condiciones: [{ id_tipo_servicio: 7, tipo_servicio: 'Estándar simulado', costo_flete: 45000, tiempo_entrega: 24 }] }] })
    if (ruta.includes('/envios/confirmar_servicio')) return responder({ datos: [{ codigo: '0', mensaje: 'OK (simulado)', numero_guia: `SIM-${String(cuerpo.id_solicitud || cuerpo.codigo_operacion || 'X').slice(-8)}` }] })
    if (ruta.includes('/envios/tracking')) return responder({ datos: [{ numero_guia: 'SIM', fecha: '2026-09-21 10:00:00', estado: 'En tránsito (simulado)', tipo_evento: 'Movimiento', observacion: 'Evento simulado del harness' }] })
    return new Response(JSON.stringify({ codigo: '99', mensaje: 'ruta no simulada' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

const { aexConfigurado, aexQuote, aexSolicitarYConfirmar, aexTrackingDetallado, aexUltimaFalla } = await import('../backend/lib/aex.ts')

const apiUrl = String(process.env.MOBOS_AEX_API_URL || '').trim()
const etapa = (nombre) => console.log(`\n[${nombre}]`)
const detalleFalla = () => {
  const falla = aexUltimaFalla()
  return falla ? `etapa=${falla.etapa} codigo=${falla.codigo} mensaje=${falla.mensaje}` : 'sin detalle de AEX'
}

if (!aexConfigurado()) {
  etapa('configuracion')
  console.error('✖ Faltan las claves sandbox de AEX en backend/.env (las tiene Dario por correo):')
  console.error('    MOBOS_AEX_PUBLIC_KEY=<clave pública sandbox>')
  console.error('    MOBOS_AEX_PRIVATE_KEY=<clave privada sandbox>')
  console.error('    MOBOS_AEX_API_URL=https://sandbox.aex.com.py/api/v1')
  console.error('  No se hizo ninguna llamada.')
  process.exit(2)
}

if (!/sandbox\.aex\.com\.py/i.test(apiUrl) && process.env.MOBOS_AEX_PERMITIR_PRODUCCION !== '1') {
  console.error(`✖ MOBOS_AEX_API_URL no apunta al sandbox: ${apiUrl || '(vacía)'}`)
  process.exit(1)
}

console.log(`AEX sandbox · ${apiUrl}${simulado ? ' · simulado' : ''}`)

// ── Modo consulta: SOLO LECTURA por código de operación ─────────────────────
if (consultaOperacion) {
  etapa(`consulta (solo lectura) codigo_operacion=${consultaOperacion}`)
  const resultado = await aexTrackingDetallado({ codigoOperacion: consultaOperacion })
  if (!resultado.ok) {
    console.error(`✖ AEX rechazó la consulta · etapa=${resultado.etapa} codigo=${resultado.codigo} mensaje=${resultado.mensaje}`)
    process.exit(3)
  }
  console.log(`✔ Consulta aceptada por AEX (codigo=${resultado.codigo || '0'})`)
  if (!resultado.eventos.length) console.log('  Sin eventos para esa operación.')
  for (const evento of resultado.eventos.slice(0, 10)) {
    console.log(`  · ${evento.fecha} · ${evento.estado}${evento.tipoEvento ? ` · ${evento.tipoEvento}` : ''}${evento.observacion ? ` — ${evento.observacion}` : ''}`)
  }
  process.exit(0)
}

// ── Diagnóstico: autorización, ciudades y cotización (no crea nada) ─────────
const origen = 'Asunción'
const destino = 'Ciudad del Este'
const pesoKg = 1
etapa('cotizacion (no crea nada)')
const cotizaciones = await aexQuote(origen, destino, pesoKg)
if (!cotizaciones || !cotizaciones.length) {
  console.error(`✖ La cotización no devolvió servicios · ${detalleFalla()}`)
  process.exit(4)
}
for (const cotizacion of cotizaciones) {
  console.log(`  · [${cotizacion.serviceId}] ${cotizacion.serviceName}: Gs. ${cotizacion.costPyg.toLocaleString('es-PY')}${cotizacion.deliveryHours ? ` · ${cotizacion.deliveryHours} h` : ''}`)
}

if (!crearGuia) {
  console.log('\nListo para crear UNA guía ficticia. Requiere OK explícito:')
  console.log('  npm run aex:sandbox -- --crear-guia        (o MOBOS_AEX_OK=1)')
  process.exit(0)
}

// ── Creación de UNA guía ficticia (con OK explícito) ────────────────────────
const codigoOperacion = `MOBOS-SANDBOX-${randomUUID().slice(0, 8)}`
etapa(`solicitar_servicio + confirmar_servicio (una sola guía · ${codigoOperacion})`)
const envio = await aexSolicitarYConfirmar({
  origen,
  destino,
  pesoKg,
  codigoOperacion,
  remitente: { tipoDocumento: 'RUC', numeroDocumento: '80012345-0', nombre: 'Comercio demo', email: 'comercio@demo.mobos', telefono: 21000000 },
  destinatario: { tipoDocumento: 'CI', numeroDocumento: '1234567', nombre: 'Cliente demo', apellido: 'Prueba', email: 'cliente@demo.mobos', telefono: 981000000 },
  pickup: { codigo: 'DEMO-ORIGEN', callePrincipal: 'Av. Ficticia 1234', numeroCasa: 123, calleTransversal1: 'Calle Falsa', referencias: 'Portón negro (demo)' },
  entrega: { codigo: 'DEMO-DESTINO', callePrincipal: 'Av. del Demo 789', numeroCasa: 456, calleTransversal1: 'Calle Ejemplo', referencias: 'Frente a la plaza (demo)' },
})
if (!envio.ok) {
  console.error(`✖ AEX rechazó la operación · etapa=${envio.etapa} codigo=${envio.codigo} mensaje=${envio.mensaje}`)
  console.error(`  (referencia local: codigo_operacion=${codigoOperacion}; no se reintenta solo)`)
  process.exit(5)
}
console.log(`✔ id_solicitud=${envio.idSolicitud} · servicio=${envio.servicio} · Gs. ${envio.costoPyg.toLocaleString('es-PY')}`)
console.log(`✔ guía ficticia: ${envio.guia}`)
console.log(`  codigo_operacion: ${codigoOperacion}`)

etapa('tracking')
const tracking = await aexTrackingDetallado({ guia: envio.guia })
if (!tracking.ok) {
  console.error(`✖ El tracking rechazó la consulta · etapa=${tracking.etapa} codigo=${tracking.codigo} mensaje=${tracking.mensaje}`)
  process.exit(6)
}
if (!tracking.eventos.length) console.log('  Sin eventos por ahora (guía recién creada).')
for (const evento of tracking.eventos.slice(0, 5)) console.log(`  · ${evento.fecha} · ${evento.estado}${evento.observacion ? ` — ${evento.observacion}` : ''}`)
console.log('\nListo: una sola guía ficticia creada en sandbox.')
