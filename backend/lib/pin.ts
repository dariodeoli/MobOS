// Reglas del PIN de operador: 4 a 6 dígitos, solo en claro mientras viaja por
// HTTPS; en la base queda únicamente el hash. `pinLength` guarda el largo para
// que la pantalla de PIN valide sola (sin Enter) al completarlo.
export const PIN_MIN = 4
export const PIN_MAX = 6

export function pinValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4,6}$/.test(valor)
}

// Largo efectivo del PIN de un usuario: los usuarios viejos (sin columna) son 4.
export function largoPinDe(pinLength: number | null | undefined): number {
  return typeof pinLength === 'number' && pinLength >= PIN_MIN && pinLength <= PIN_MAX ? pinLength : PIN_MIN
}
