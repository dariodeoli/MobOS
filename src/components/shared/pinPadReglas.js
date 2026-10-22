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

// Estado visual/hablado del PIN: vacío → parcial → validando (completo y
// bloqueado, esperando al servidor) → error | éxito. Fuente única para las
// animaciones (data-*) y para el aviso accesible.
export function estadoPin({ largo = 0, total = PIN_LARGO_MIN, invalido = false, exito = false, disabled = false } = {}) {
  if (exito) return 'exito'
  if (invalido) return 'error'
  if (largo >= total) return disabled ? 'validando' : 'lleno'
  return largo > 0 ? 'parcial' : 'vacio'
}

export function textoEstadoPin(estado, largo, total) {
  if (estado === 'exito') return 'PIN correcto'
  if (estado === 'validando') return 'Validando PIN'
  if (estado === 'parcial' || estado === 'lleno') return `${largo} de ${total} dígitos ingresados`
  return ''
}
