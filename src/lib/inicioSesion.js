import { ApiError } from './api/errors.js'

export function esRetornoGoogle(location) {
  return location?.pathname === '/login' && new URLSearchParams(location.search).get('google') === 'ready'
}

// Una continuación por montaje de retorno; StrictMode puede soltar y volver
// a adquirir su suscripción sin repetir el POST de un solo uso.
export function crearRetornoGoogle(leerGeneracion) {
  let generacion = leerGeneracion()
  let cancelado = false
  let promesa
  const suscriptores = new Set()
  const vigente = () => !cancelado && generacion === leerGeneracion()
  const exigirVigente = () => {
    if (!vigente()) throw new ApiError('El contexto de acceso cambió.', { code: 'CONTEXT_CHANGED' })
  }
  const aplicarContexto = mutacion => {
    exigirVigente()
    // Limpiar la sesión anterior y guardar SOLO la respuesta validada son una
    // transición síncrona propietaria. Su purga es esperada.
    const resultado = mutacion()
    generacion = leerGeneracion()
    return resultado
  }
  return {
    vigente, exigirVigente, aplicarContexto,
    suscribir() {
      const token = {}
      suscriptores.add(token)
      return () => {
        suscriptores.delete(token)
        queueMicrotask(() => { if (!suscriptores.size) cancelado = true })
      }
    },
    ejecutar(completar) {
      if (!promesa) promesa = Promise.resolve().then(() => {
        exigirVigente()
        return completar({ aplicarContexto })
      }).then(resultado => { exigirVigente(); return resultado })
      return promesa
    },
  }
}
