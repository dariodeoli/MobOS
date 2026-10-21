// Lógica pura del teclado de PIN (PinPad): qué pasa al tocar una tecla y cuándo
// el PIN está completo. Sin React para probarla; el valor vive en el padre
// (PinSegmentado) y nunca se registra ni se loguea.

export const PIN_LARGO_MIN = 4
export const PIN_LARGO_MAX = 6
export const TECLA_BORRAR = 'borrar'
export const TECLAS_PIN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export function largoPin(largo) {
  return Math.min(PIN_LARGO_MAX, Math.max(PIN_LARGO_MIN, Number(largo) || PIN_LARGO_MIN))
}

// Valor siguiente al tocar `tecla`: un dígito se agrega hasta completar, borrar
// quita el último; cualquier otra cosa no cambia nada.
export function aplicarTecla(valor, tecla, largo = PIN_LARGO_MIN) {
  const actual = String(valor ?? '').replace(/\D/g, '')
  const total = largoPin(largo)
  if (tecla === TECLA_BORRAR) return actual.slice(0, -1)
  if (!/^[0-9]$/.test(String(tecla))) return actual
  return actual.length >= total ? actual.slice(0, total) : `${actual}${tecla}`
}

export function pinCompleto(valor, largo = PIN_LARGO_MIN) {
  return String(valor ?? '').replace(/\D/g, '').length === largoPin(largo)
}
