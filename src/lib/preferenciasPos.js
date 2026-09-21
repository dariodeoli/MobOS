// Preferencias de POS «último usado como predeterminado» (#209). Mismo patrón
// que nivelPreferido/recordarPreferencia del comprobante (#208), en un helper
// común para las pantallas del POS (cuenta de cobro, tipo de entrega, etc.).
//
// En la demo nada toca `localStorage` (#201/#204): `demoStorage` guarda en
// memoria de la pestaña y al recargar se descarta, igual que el resto de los
// datos demo. Fuera de la demo persiste como siempre.
import { borrarDemo, guardarDemo, leerDemo } from './demoStorage.js'

const PREFIJO = 'mobos:pos:'

export function preferenciaPos(clave, porDefecto = '') {
  try {
    const guardado = leerDemo(`${PREFIJO}${clave}`)
    return guardado === null || guardado === '' ? porDefecto : guardado
  } catch {
    return porDefecto
  }
}

export function recordarPos(clave, valor) {
  try {
    if (valor === undefined || valor === null || valor === '') borrarDemo(`${PREFIJO}${clave}`)
    else guardarDemo(`${PREFIJO}${clave}`, String(valor))
  } catch {
    /* sin almacenamiento: la preferencia es un lujo, no un requisito */
  }
}
