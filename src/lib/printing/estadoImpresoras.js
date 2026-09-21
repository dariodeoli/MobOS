// Estado vivo de las impresoras: verificación invisible por el agente local.
// Módulo puro (sin dependencias de la app) para poder testearlo con
// `node --test`, mismo criterio que ruteo.js y puentes.js.

export const ESTADO_IMPRESORA = Object.freeze({
  SIN_VERIFICAR: 'sin-verificar',
  VERIFICANDO: 'verificando',
  OK: 'ok',
  ERROR: 'error',
})

// Etiquetas de UI: el estado se muestra tal cual, sin abreviaturas.
export const ETIQUETA_ESTADO = Object.freeze({
  'sin-verificar': 'Sin verificar',
  'verificando': 'Verificando…',
  'ok': 'Lista para imprimir',
  'error': 'Sin respuesta',
})

// Tono semántico (la UI lo traduce a colores de Badge/Dot).
export const TONO_ESTADO = Object.freeze({
  'sin-verificar': 'slate',
  'verificando': 'slate',
  'ok': 'ok',
  'error': 'bad',
})

// Motivos que informa el diagnóstico del agente, en texto para el operador.
const MOTIVO_TEXTO = Object.freeze({
  red_cambiada: 'La impresora no está en esta red',
  permisos_red_local: 'macOS bloqueó la salida a la red local',
  permiso_o_red: 'Puede faltar el permiso de Red Local de macOS',
  impresora_apagada: 'La impresora rechazó la conexión',
})

// Estados de un trabajo de impresión: una sola etiqueta honesta para la cola,
// la actividad y el monitor (#205). Acepta el estado del backend (mayúsculas)
// o el de la actividad (minúsculas). `aceptado` NO es "impreso": el transporte
// aceptó el envío y falta confirmar el papel.
export const ETIQUETA_TRABAJO = Object.freeze({
  pendiente: 'Pendiente',
  reclamado: 'En el puente',
  aceptado: 'Aceptado (falta confirmar)',
  incierto: 'Incierto',
  fallido: 'Fallido',
  confirmado: 'Confirmado en papel',
  cancelado: 'Cancelado',
  impreso: 'Impreso',
})
const TONO_TRABAJO = Object.freeze({
  pendiente: 'orange',
  reclamado: 'blue',
  aceptado: 'blue',
  incierto: 'orange',
  fallido: 'red',
  confirmado: 'green',
  cancelado: 'slate',
  impreso: 'green',
})
export const etiquetaTrabajo = (estado) => ETIQUETA_TRABAJO[String(estado || '').toLowerCase()] || String(estado || '—')
export const colorTrabajo = (estado) => TONO_TRABAJO[String(estado || '').toLowerCase()] || 'slate'

// Traduce el resultado de `diagnosticoAgente(destino)` al estado binario.
// Una cola CUPS no tiene TCP: se considera lista cuando el sistema confirma su
// URI real; si la cola no existe, es un error de configuración.
export function estadoDeDiagnostico(resultado) {
  if (!resultado || typeof resultado !== 'object' || resultado.ok === false) return ESTADO_IMPRESORA.ERROR
  if (resultado.alcance === true) return ESTADO_IMPRESORA.OK
  if (resultado.metodo === 'CUPS') return resultado.cupsUri ? ESTADO_IMPRESORA.OK : ESTADO_IMPRESORA.ERROR
  return ESTADO_IMPRESORA.ERROR
}

// Motivo legible de un fallo (nunca se inventa un motivo conocido: si no hay
// código, se muestra el error real del agente).
export function motivoDeDiagnostico(resultado) {
  if (!resultado || typeof resultado !== 'object') return 'El agente no respondió'
  if (resultado.metodo === 'CUPS' && !resultado.cupsUri) return 'La cola CUPS no existe en esta computadora'
  return MOTIVO_TEXTO[resultado.motivo] || String(resultado.error || 'Sin respuesta de la impresora')
}

// Línea de la última verificación: "Verificada hace Xs" o el motivo del fallo.
export function textoVerificacion(registro, ahora = Date.now()) {
  if (!registro || registro.estado === ESTADO_IMPRESORA.SIN_VERIFICAR) return 'Sin verificar'
  if (registro.estado === ESTADO_IMPRESORA.VERIFICANDO) return 'Verificando…'
  const segundos = Number.isFinite(registro.fecha) ? Math.max(0, Math.round((ahora - registro.fecha) / 1000)) : 0
  if (registro.estado === ESTADO_IMPRESORA.OK) return `Verificada hace ${segundos} s`
  return registro.motivo ? `Sin respuesta: ${registro.motivo}` : 'Sin respuesta'
}

// Agregado por empresa: "Listo para imprimir" si todas las activas están ok,
// "Con problemas" si alguna falló, "Sin verificar" si todavía no hay datos.
export function agregarEstado(impresoras = [], estados = {}) {
  const activas = (impresoras || []).filter((impresora) => impresora?.activa !== false)
  const total = activas.length
  let ok = 0
  let error = 0
  for (const impresora of activas) {
    const estado = estados?.[impresora?.id]?.estado
    if (estado === ESTADO_IMPRESORA.OK) ok += 1
    else if (estado === ESTADO_IMPRESORA.ERROR) error += 1
  }
  const sinVerificar = total - ok - error
  if (!total) return { estado: 'sin-verificar', label: 'Sin verificar', tono: 'slate', total, ok, error, sinVerificar, detalle: 'Sin impresoras activas' }
  if (error > 0) return { estado: 'con-problemas', label: 'Con problemas', tono: 'bad', total, ok, error, sinVerificar, detalle: `${error} de ${total} sin respuesta` }
  if (ok === total) return { estado: 'listo', label: 'Listo para imprimir', tono: 'ok', total, ok, error, sinVerificar, detalle: `${total} de ${total} listas` }
  return { estado: 'sin-verificar', label: 'Sin verificar', tono: 'slate', total, ok, error, sinVerificar, detalle: `${sinVerificar} de ${total} sin verificar` }
}
