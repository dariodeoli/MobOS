// Caché de fotos por usuario con invalidación (#271) y persistencia (#284).
// Es lógica pura (sin imports de la app) para poder probarla en Node;
// `userAvatar` la instancia con la descarga real.
//
// Qué resuelve cada cosa:
// - #271: guardaba la promesa por `userId` y nadie avisaba cuando la foto se
//   reemplazaba o se quitaba; `olvidar` borra la entrada, avisa a los
//   suscriptores del módulo y emite `mobos:avatar-cambio` para cualquier otra
//   instancia.
// - #284: cada recarga empezaba de cero y se veía el placeholder hasta que
//   llegaba la red. Ahora el data URL se guarda **por usuario** en un almacén
//   persistente (localStorage), `cacheado()` lo lee de forma síncrona para
//   pintar al instante y la revalidación con ETag corre en segundo plano; si
//   la foto cambió, se actualiza y se avisa por el mismo canal.
export const EVENTO_AVATAR = 'mobos:avatar-cambio'

// Almacén persistente del data URL por usuario. `storage` se inyecta (en la app
// es localStorage, en los tests un mock). Claves: `<prefijo>:<userId>`.
export function crearAlmacenAvatar(storage, { prefijo = 'mobos:avatar', maxBytes = 700 * 1024, maxEntradas = 6 } = {}) {
  const claveDe = (userId) => `${prefijo}:${userId}`
  const leerCrudo = (clave) => {
    try { return storage?.getItem(clave) ?? null } catch { return null }
  }
  const entradas = () => {
    const lista = []
    try {
      for (let i = 0; i < (storage?.length || 0); i++) {
        const clave = storage.key(i)
        if (!clave?.startsWith(`${prefijo}:`)) continue
        const crudo = leerCrudo(clave)
        try { lista.push({ clave, ...(JSON.parse(crudo || '{}') || {}), at: Number(JSON.parse(crudo || '{}')?.at) || 0 }) } catch { lista.push({ clave, at: 0 }) }
      }
    } catch { /* sin almacenamiento */ }
    return lista
  }
  return {
    /** Entrada cacheada de un usuario, o null. */
    leer(userId) {
      if (!userId) return null
      const crudo = leerCrudo(claveDe(userId))
      if (!crudo) return null
      try {
        const dato = JSON.parse(crudo)
        return typeof dato?.url === 'string' && dato.url ? { url: dato.url, etag: String(dato.etag || ''), at: Number(dato.at) || 0 } : null
      } catch { return null }
    },
    /** Guarda la foto; si no entra (tamaño o cuota) no rompe nada. */
    guardar(userId, { url, etag = '' } = {}) {
      if (!userId || typeof url !== 'string' || !url) return false
      if (url.length > maxBytes) return false // fotos enormes: no se cachean
      const escribir = () => {
        storage.setItem(claveDe(userId), JSON.stringify({ url, etag: String(etag || ''), at: Date.now() }))
      }
      try {
        escribir()
        return true
      } catch {
        // Cuota llena: se descartan las entradas más viejas (empezando por las
        // que no son de este usuario) y se reintenta una vez.
        try {
          const lista = entradas().sort((a, b) => a.at - b.at).slice(0, maxEntradas)
          for (const entrada of lista) {
            if (entrada.clave === claveDe(userId)) continue
            try { storage.removeItem(entrada.clave) } catch { /* seguir */ }
          }
          escribir()
          return true
        } catch { return false }
      }
    },
    olvidar(userId) {
      if (!userId) return
      try { storage?.removeItem(claveDe(userId)) } catch { /* sin almacenamiento */ }
    },
    /** Borra todas las fotos cacheadas (cierre de sesión en equipos compartidos). */
    limpiar() {
      try {
        for (const entrada of entradas()) {
          try { storage.removeItem(entrada.clave) } catch { /* seguir */ }
        }
      } catch { /* sin almacenamiento */ }
    },
  }
}

// Normaliza lo que devuelve la descarga: un string (contrato viejo) o
// `{ url, etag, noModificado, error, borrada }` (#284). `error` marca un fallo
// de red (no se puede concluir que la foto ya no esté) y `borrada` una respuesta
// del servidor sin foto (404).
const normalizar = (resultado) => (typeof resultado === 'string'
  ? { url: resultado, etag: '', noModificado: false, error: false, borrada: false }
  : { url: resultado?.url || '', etag: String(resultado?.etag || ''), noModificado: Boolean(resultado?.noModificado), error: Boolean(resultado?.error), borrada: Boolean(resultado?.borrada) })

export function crearCacheAvatar(cargar, { almacen = null, revalidarCadaMs = 30_000 } = {}) {
  const valores = new Map() // userId → { url, etag }
  const pendientes = new Map() // userId → promesa en vuelo
  const revalidaciones = new Map() // userId → timestamp de la última revalidación
  const suscriptores = new Set()

  const notificar = (userId) => {
    for (const suscriptor of suscriptores) {
      try { suscriptor(userId) } catch { /* un suscriptor roto no frena a los demás */ }
    }
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_AVATAR, { detail: { userId } }))
    } catch { /* entorno sin DOM: los suscriptores del módulo ya avisaron */ }
  }

  const guardarValor = (userId, { url, etag }) => {
    valores.set(userId, { url, etag })
    almacen?.guardar(userId, { url, etag })
  }

  const descargar = (userId, opciones) => {
    if (!pendientes.has(userId)) {
      pendientes.set(userId, Promise.resolve()
        .then(() => cargar(userId, opciones))
        .then(normalizar)
        .finally(() => pendientes.delete(userId)))
    }
    return pendientes.get(userId)
  }

  // Revalidación de fondo: no bloquea el pintado y no repite dentro de la
  // ventana (muchos avatares en pantalla comparten una sola revalidación).
  const revalidar = (userId) => {
    const ultima = revalidaciones.get(userId) || 0
    if (Date.now() - ultima < revalidarCadaMs) return
    revalidaciones.set(userId, Date.now())
    const etag = valores.get(userId)?.etag || ''
    descargar(userId, { etag }).then((resultado) => {
      if (resultado.noModificado) return
      // #284: un fallo de red NO puede borrar la foto buena ya cacheada (antes
      // una revalidación abortada dejaba el avatar en iniciales). Solo una
      // respuesta del servidor sin foto (404) la invalida.
      if (resultado.error) return
      // El servidor dice que ya no hay foto: se invalida memoria y persistencia.
      if (resultado.borrada) {
        valores.delete(userId)
        almacen?.olvidar(userId)
        notificar(userId)
        return
      }
      const actual = valores.get(userId)?.url || ''
      if (resultado.url === actual) return
      guardarValor(userId, resultado)
      notificar(userId)
    }).catch(() => { /* la revalidación es best-effort */ })
  }

  return {
    /** Foto del usuario: comparte la descarga entre componentes. */
    obtener(userId) {
      if (!userId) return Promise.resolve('')
      if (valores.has(userId)) {
        revalidar(userId)
        return Promise.resolve(valores.get(userId).url)
      }
      const persistida = almacen?.leer(userId)
      if (persistida?.url) {
        valores.set(userId, { url: persistida.url, etag: persistida.etag })
        revalidar(userId)
        return Promise.resolve(persistida.url)
      }
      return descargar(userId).then((resultado) => {
        if (!valores.has(userId)) guardarValor(userId, resultado)
        return valores.get(userId)?.url || ''
      })
    },

    /** Lectura síncrona (memoria o almacén) para pintar en el primer render. */
    cacheado(userId) {
      if (!userId) return ''
      if (valores.has(userId)) return valores.get(userId).url || ''
      const persistida = almacen?.leer(userId)
      if (persistida?.url) {
        valores.set(userId, { url: persistida.url, etag: persistida.etag })
        return persistida.url
      }
      return ''
    },

    /** Invalida la foto (cambio o quita) y avisa a los componentes montados. */
    olvidar(userId) {
      if (!userId) return
      valores.delete(userId)
      pendientes.delete(userId)
      revalidaciones.delete(userId)
      almacen?.olvidar(userId)
      notificar(userId)
    },

    /** Borra todo (cierre de sesión): memoria y almacén persistente. */
    limpiar() {
      valores.clear()
      pendientes.clear()
      revalidaciones.clear()
      almacen?.limpiar()
    },

    /** Se suscribe a las invalidaciones; devuelve la baja. */
    suscribir(callback) {
      if (typeof callback !== 'function') return () => {}
      suscriptores.add(callback)
      return () => { suscriptores.delete(callback) }
    },
  }
}
