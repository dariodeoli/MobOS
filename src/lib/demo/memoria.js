// Solo memoria: los snapshots se clonan para no compartir referencias mutables.
export function crearCacheDemo(contexto) {
  const empresas = new Map()
  const clone = valor => JSON.parse(JSON.stringify(valor))
  return Object.freeze({
    guardar(token, valor) {
      if (!contexto.vigente(token)) return false
      empresas.set(token.empresaId, clone(valor))
      return true
    },
    leer(token) {
      if (!contexto.vigente(token) || !empresas.has(token.empresaId)) return null
      return clone(empresas.get(token.empresaId))
    },
    limpiar() { empresas.clear() },
  })
}

export function crearAlmacenDemo(contexto) {
  const empresas = new Map()
  function almacen(token = contexto.capturar()) {
    const vigente = () => contexto.vigente(token)
    const datos = () => {
      if (!empresas.has(token.empresaId)) empresas.set(token.empresaId, new Map())
      return empresas.get(token.empresaId)
    }
    return {
      getItem: clave => vigente() ? datos().get(clave) ?? null : null,
      setItem: (clave, valor) => { if (vigente()) datos().set(clave, String(valor)) },
      removeItem: clave => { if (vigente()) datos().delete(clave) },
    }
  }
  return Object.freeze({ almacen, limpiar() { empresas.clear() } })
}
