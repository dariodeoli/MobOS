// Preferencias de POS «último usado como predeterminado» (#209). Mismo patrón
// que nivelPreferido/recordarPreferencia del comprobante (#208), en un helper
// común para las pantallas del POS (cuenta de cobro, tipo de entrega, etc.).
const PREFIJO = 'mobos:pos:'

export function preferenciaPos(clave, porDefecto = '') {
  try {
    return localStorage.getItem(`${PREFIJO}${clave}`) || porDefecto
  } catch {
    return porDefecto
  }
}

export function recordarPos(clave, valor) {
  try {
    if (valor === undefined || valor === null || valor === '') localStorage.removeItem(`${PREFIJO}${clave}`)
    else localStorage.setItem(`${PREFIJO}${clave}`, String(valor))
  } catch {
    /* sin almacenamiento: la preferencia es un lujo, no un requisito */
  }
}
