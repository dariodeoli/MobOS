// Presencia de un puente de impresión: una sola forma de mostrarla en toda la
// pantalla (tarjeta de Puentes y tile de Diagnóstico). El backend devuelve
// `online`, `lastSeenAt`, `version` y `platform`; el demo usa la misma forma.
//
// La versión y el último contacto salen del mismo registro, así que no pueden
// contradecirse: en línea se muestra la versión reportada (o «versión sin
// reportar»), sin conexión se muestra el último contacto. `formatearHace` lo
// aporta la pantalla: acá no se lee el reloj.

const texto = (valor) => String(valor ?? '').trim()

export function versionDePuente(puente = null) {
  return texto(puente?.version)
}

export function plataformaDePuente(puente = null) {
  return texto(puente?.plataforma || puente?.platform)
}

export function ultimoContactoDePuente(puente = null) {
  return puente?.lastSeenAt || puente?.ultimaSenal || null
}

/**
 * Etiqueta y detalle de presencia coherentes para la tarjeta del puente.
 * Nunca inventa una versión que el puente no reportó.
 *
 * @param {object} puente Registro del backend o fixture del demo.
 * @param {{ formatearHace?: (fecha: string|Date) => string }} [opciones]
 */
export function presenciaDePuente(puente, { formatearHace = () => 'sin registro' } = {}) {
  const version = versionDePuente(puente)
  const plataforma = plataformaDePuente(puente)
  const ultimo = ultimoContactoDePuente(puente)
  const contexto = [plataforma, version ? `versión ${version}` : ''].filter(Boolean).join(' · ')
  if (puente?.online) {
    return {
      tono: 'green',
      label: version ? `en línea · v${version}` : 'en línea',
      detalle: contexto || 'versión sin reportar',
    }
  }
  return {
    tono: 'slate',
    label: ultimo ? `sin conexión · ${formatearHace(ultimo)}` : 'sin conexión · sin registro',
    detalle: contexto ? `última reportada: ${contexto}` : 'sin versión reportada',
  }
}
