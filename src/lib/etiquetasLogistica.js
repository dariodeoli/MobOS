// Etiquetas humanas de logística (#461): nada de códigos internos en pantalla
// (AEX/LOCAL, EN_TRANSITO, NUEVO_ESTADO…). Un solo lugar para todas las vistas.

const METODOS = {
  AEX: 'Courier AEX',
  LOCAL: 'Entrega propia',
  BUS: 'Bus',
  TRANSPORTADORA: 'Transportadora',
  IMPORTACION: 'Importación',
  MOTO: 'Moto propia',
}

/** «Courier AEX», «Entrega propia»… Un valor desconocido se escribe en minúsculas legibles. */
export function metodoEnvioTexto(valor) {
  const clave = String(valor || '').trim().toUpperCase()
  if (!clave) return ''
  return METODOS[clave] || legible(clave)
}

/** «EN_TRANSITO» → «En tránsito» cuando no hay una etiqueta propia. */
export function legible(codigo) {
  const texto = String(codigo || '').trim().replace(/[_-]+/g, ' ').toLowerCase()
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : ''
}

const ESTADOS_ENVIO = {
  PREPARANDO: 'Preparando',
  DESPACHADO: 'Despachado',
  EN_TRANSITO: 'En tránsito',
  CON_INCIDENCIA: 'Con incidencia',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
}
export const estadoEnvioTexto = (valor) => ESTADOS_ENVIO[String(valor || '').trim().toUpperCase()] || legible(valor)

const BANCOS = { continental: 'Continental', ueno: 'Ueno', itau: 'Itaú', itaú: 'Itaú', familiar: 'Familiar', basa: 'BASA', visión: 'Visión', vision: 'Visión', sudameris: 'Sudameris', atlas: 'Atlas', gnb: 'GNB', bnf: 'BNF', interfisa: 'Interfisa', rio: 'Río', río: 'Río', 'banco rio': 'Banco Río' }

/** Nombre de banco con mayúscula inicial (y las siglas conocidas en mayúsculas): «continental» → «Continental». */
export function nombreBanco(nombre) {
  const texto = String(nombre ?? '').trim()
  if (!texto) return ''
  return texto.split(/\s+/).map((palabra) => {
    const conocida = BANCOS[palabra.toLowerCase()]
    if (conocida) return conocida
    return palabra.charAt(0).toUpperCase() + palabra.slice(1)
  }).join(' ')
}
