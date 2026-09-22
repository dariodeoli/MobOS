import assert from 'node:assert/strict'
import { aexSolicitarYConfirmar, aexTrackingDetallado, aexTransporteDePrueba, tipoDocumentoAex } from '../lib/aex'

// #3: el adaptador de envíos sigue la doc v1.5.4 — `solicitar_servicio` y
// `confirmar_servicio` devuelven JSON Array, la confirmación exige remitente,
// pickup, destinatario y entrega — y cada etapa reporta el código/mensaje de
// AEX. Todo con un transporte simulado inyectado: sin red ni guías reales.

process.env.MOBOS_AEX_API_URL = 'https://sandbox.aex.com.py/api/v1'
process.env.MOBOS_AEX_PUBLIC_KEY = 'clave-publica-sandbox'
process.env.MOBOS_AEX_PRIVATE_KEY = 'clave-privada-sandbox'

const CIUDADES = [{ codigo_ciudad: 'ASU', denominacion: 'Asunción' }, { codigo_ciudad: 'CDE', denominacion: 'Ciudad del Este' }]
const estado: { solicitarError: { codigo: string; mensaje: string } | null; confirmarError: { codigo: string; mensaje: string } | null; confirmarPayload: any; capturas: Record<string, any>; trackingBody: any } = { solicitarError: null, confirmarError: null, confirmarPayload: null, capturas: {}, trackingBody: null }
const respuesta = (datos: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => datos })

aexTransporteDePrueba(async (url, opciones) => {
  const ruta = String(url)
  const cuerpo = opciones?.body ? JSON.parse(String(opciones.body)) : {}
  if (ruta.includes('/autorizacion-acceso/generar')) return respuesta({ codigo_autorizacion: 'token-test' })
  if (ruta.includes('/envios/ciudades')) return respuesta({ datos: CIUDADES })
  if (ruta.includes('/envios/solicitar_servicio')) {
    estado.capturas.solicitar = cuerpo
    if (estado.solicitarError) return respuesta(estado.solicitarError)
    return respuesta({ datos: [{ id_solicitud: 55, condiciones: [{ id_tipo_servicio: 2, tipo_servicio: 'Express', costo_flete: 150000, tiempo_entrega: 24 }, { id_tipo_servicio: 1, tipo_servicio: 'Estándar', costo_flete: 90000, tiempo_entrega: 48 }] }] })
  }
  if (ruta.includes('/envios/confirmar_servicio')) {
    estado.capturas.confirmar = cuerpo
    if (estado.confirmarError) return respuesta(estado.confirmarError)
    return respuesta(estado.confirmarPayload || { datos: [{ codigo: '0', mensaje: 'OK', numero_guia: 'A009999999' }] })
  }
  if (ruta.includes('/envios/tracking')) {
    estado.trackingBody = cuerpo
    return respuesta({ datos: [{ numero_guia: 'A009999999', fecha: '2026-09-21 10:00:00', estado: 'En tránsito', tipo_evento: 'Movimiento', observacion: 'En camino' }] })
  }
  throw new Error(`ruta no simulada: ${ruta}`)
})

const entrada = () => ({
  origen: 'Asunción',
  destino: 'Ciudad del Este',
  pesoKg: 1,
  codigoOperacion: 'MOBOS-SANDBOX-test',
  remitente: { tipoDocumento: 'RUC', numeroDocumento: '80012345-0', nombre: 'Comercio demo', email: 'comercio@demo.mobos', telefono: 21000000 },
  destinatario: { tipoDocumento: 'CI', numeroDocumento: '1234567', nombre: 'Cliente demo', email: 'cliente@demo.mobos', telefono: 981000000 },
  pickup: { codigo: 'DEMO-ORIGEN', callePrincipal: 'Av. Ficticia 1234', numeroCasa: 123, calleTransversal1: 'Calle Falsa', referencias: 'Portón negro' },
  entrega: { codigo: 'DEMO-DESTINO', callePrincipal: 'Av. del Demo 789', calleTransversal1: 'Calle Ejemplo', referencias: 'Frente a la plaza' },
})

// Otros tests del mismo proceso (aex-label) borran las claves para probar el
// camino sin configuración: se reafirman antes de cada llamada.
const asegurarClaves = () => {
  process.env.MOBOS_AEX_API_URL = 'https://sandbox.aex.com.py/api/v1'
  process.env.MOBOS_AEX_PUBLIC_KEY = 'clave-publica-sandbox'
  process.env.MOBOS_AEX_PRIVATE_KEY = 'clave-privada-sandbox'
}
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// Reintenta si otro test del proceso borró las claves justo en medio del await
// (las fallas transitorias son 'configuracion'/'ciudades', nunca de AEX).
const conClaves = async <T extends { ok: boolean; etapa?: string }>(fn: () => Promise<T>): Promise<T> => {
  let resultado: T | null = null
  for (let intento = 0; intento < 6; intento += 1) {
    asegurarClaves()
    resultado = await fn()
    if (resultado.ok || !['configuracion', 'ciudades'].includes(String(resultado.etapa))) return resultado
    await esperar(20)
  }
  return resultado as T
}

async function pruebas() {
  // Paso 1: oferta en ARRAY (condiciones) y confirmación con destinatario y
  // campos de dirección requeridos por la doc.
  const envio = await conClaves(() => aexSolicitarYConfirmar(entrada()))
  if (!envio.ok) console.error('falla inesperada:', envio.etapa, envio.codigo, envio.mensaje)
  assert.equal(envio.ok, true, 'la oferta en array se interpreta bien')
  if (!envio.ok) return
  assert.equal(envio.guia, 'A009999999')
  assert.equal(envio.idSolicitud, 55)
  assert.equal(envio.costoPyg, 90000, 'elige la condición más barata')
  const confirmar = estado.capturas.confirmar
  assert.equal(confirmar.id_solicitud, 55)
  assert.equal(confirmar.id_tipo_servicio, 1)
  assert.equal(confirmar.destinatario.numero_documento, '1234567', 'destinatario incluido')
  assert.equal(confirmar.destinatario.nombre, 'Cliente demo')
  assert.equal(confirmar.destinatario.email, 'cliente@demo.mobos')
  assert.equal(confirmar.destinatario.telefonos[0].numero, 981000000)
  assert.equal(confirmar.pickup.calle_principal, 'Av. Ficticia 1234')
  assert.equal(confirmar.pickup.calle_transversal_1, 'Calle Falsa')
  assert.equal(confirmar.pickup.codigo_ciudad, 'ASU')
  assert.equal(confirmar.entrega.calle_principal, 'Av. del Demo 789')
  assert.equal(confirmar.entrega.codigo_ciudad, 'CDE')
  assert.equal(confirmar.remitente.numero_documento, '80012345-0', 'remitente incluido')
  assert.equal(estado.capturas.solicitar.codigo_operacion, 'MOBOS-SANDBOX-test', 'la operación viaja para rastrear')

  // Paso 2: la falla de la oferta se reporta con etapa + código + mensaje.
  estado.solicitarError = { codigo: '5', mensaje: 'Ciudad inválida' }
  const falla = await conClaves(() => aexSolicitarYConfirmar(entrada()))
  assert.equal(falla.ok, false)
  if (!falla.ok) {
    assert.equal(falla.etapa, 'solicitar_servicio')
    assert.equal(falla.codigo, '5')
    assert.equal(falla.mensaje, 'Ciudad inválida')
  }
  estado.solicitarError = null

  // Paso 3: la falla de la confirmación también queda con su etapa.
  estado.confirmarError = { codigo: '9', mensaje: 'Destinatario sin cobertura' }
  const fallaConfirmar = await conClaves(() => aexSolicitarYConfirmar(entrada()))
  assert.equal(fallaConfirmar.ok, false)
  if (!fallaConfirmar.ok) {
    assert.equal(fallaConfirmar.etapa, 'confirmar_servicio')
    assert.equal(fallaConfirmar.codigo, '9')
    assert.equal(fallaConfirmar.mensaje, 'Destinatario sin cobertura')
  }
  estado.confirmarError = null

  // Paso 4 (#231): confirmación sin número de guía interpretable = ambigua.
  estado.confirmarPayload = { datos: [{ codigo: '0', mensaje: 'OK' }] }
  const ambigua = await conClaves(() => aexSolicitarYConfirmar(entrada()))
  assert.equal(ambigua.ok, false)
  if (!ambigua.ok) {
    assert.equal(ambigua.etapa, 'confirmar_servicio')
    assert.equal(ambigua.codigo, 'ambiguo')
    assert.match(ambigua.mensaje, /conciliar/i)
  }
  estado.confirmarPayload = { datos: [{ guia: 'A009999999' }] }
  const recuperada = await conClaves(() => aexSolicitarYConfirmar(entrada()))
  assert.equal(recuperada.ok, true, 'acepta la guía anidada')
  estado.confirmarPayload = null

  // Paso 5: consulta read-only por codigo_operacion (no manda número de guía).
  const tracking = await conClaves(() => aexTrackingDetallado({ codigoOperacion: 'MOBOS-SANDBOX-c4183d67' }))
  assert.equal(tracking.ok, true)
  assert.equal(estado.trackingBody.codigo_operacion, 'MOBOS-SANDBOX-c4183d67')
  assert.equal(estado.trackingBody.numero_guia, undefined, 'la consulta por operación no manda guía')
  if (tracking.ok) assert.equal(tracking.eventos[0].estado, 'En tránsito')

  // La consulta sin guía ni operación no llama a AEX.
  const sinParametros = await conClaves(() => aexTrackingDetallado({}))
  assert.equal(sinParametros.ok, false)
  if (!sinParametros.ok) assert.equal(sinParametros.codigo, 'parametros')
}

pruebas()
  .then(() => { console.log('aex-ship.test.ts: ok') })
  .catch((error) => { console.error('aex-ship.test.ts: FALLO', error); process.exitCode = 1 })
  .finally(() => aexTransporteDePrueba(null))

// Tipo de documento AEX (#231): CI no es válido, la cédula va como CIP.
assert.equal(tipoDocumentoAex('CI'), 'CIP', 'CI no es válido para AEX')
assert.equal(tipoDocumentoAex('cip'), 'CIP')
assert.equal(tipoDocumentoAex('Cédula'), 'CIP')
assert.equal(tipoDocumentoAex('RUC'), 'RUC')
assert.equal(tipoDocumentoAex('pasaporte'), 'PAS')
assert.equal(tipoDocumentoAex('PASSPORT'), 'PAS')
assert.equal(tipoDocumentoAex(''), 'CIP', 'por defecto persona física')
