// Un intento pertenece al bloqueo que lo inició. Una respuesta anterior no
// puede abrir la app ni alterar el siguiente PIN después de pause/salir.
export function crearControlIntentosPin() {
  let vigente = null
  return {
    invalidar() { const anterior = vigente; vigente = null; anterior?.abort() },
    async ejecutar(validar, { alIniciar, alConfirmar, alFallar, alTerminar } = {}) {
      if (vigente) return false
      const intento = new AbortController()
      vigente = intento
      alIniciar?.()
      try {
        await validar(intento.signal)
        if (vigente === intento) alConfirmar?.()
      } catch (error) {
        if (vigente === intento) alFallar?.(error)
      } finally {
        if (vigente === intento) { vigente = null; alTerminar?.() }
      }
      return true
    },
  }
}
