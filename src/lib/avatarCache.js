// Caché de fotos por usuario con invalidación (#271). Es lógica pura (sin
// imports de la app) para poder probarla en Node; `userAvatar` la instancia con
// la descarga real.
//
// El problema que resuelve: la caché guardaba la promesa por `userId` y nadie
// avisaba a los componentes montados cuando la foto se reemplazaba o se
// quitaba, así que en toda la app seguía viéndose la foto vieja hasta
// recargar. Ahora `olvidar` borra la entrada, avisa a los suscriptores del
// módulo y emite `mobos:avatar-cambio` para cualquier otra instancia (por
// ejemplo, otro bundle).
export const EVENTO_AVATAR = 'mobos:avatar-cambio'

export function crearCacheAvatar(cargar) {
  const cache = new Map()
  const suscriptores = new Set()

  return {
    /** Foto del usuario: comparte la descarga entre componentes. */
    obtener(userId) {
      if (!userId) return Promise.resolve('')
      if (!cache.has(userId)) cache.set(userId, cargar(userId))
      return cache.get(userId)
    },

    /** Invalida la foto (cambio o quita) y avisa a los componentes montados. */
    olvidar(userId) {
      if (!userId) return
      cache.delete(userId)
      for (const suscriptor of suscriptores) {
        try { suscriptor(userId) } catch { /* un suscriptor roto no frena a los demás */ }
      }
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_AVATAR, { detail: { userId } }))
      } catch { /* entorno sin DOM: los suscriptores del módulo ya avisaron */ }
    },

    /** Se suscribe a las invalidaciones; devuelve la baja. */
    suscribir(callback) {
      if (typeof callback !== 'function') return () => {}
      suscriptores.add(callback)
      return () => { suscriptores.delete(callback) }
    },
  }
}
