// Mensajes de «Eliminar mi cuenta». El dueño de una tienda no puede borrarse
// mientras la tienda exista: el API responde con un conflicto y acá se explica
// el camino en lenguaje llano.

const AYUDA_DUENO = 'Primero transferí o eliminá la tienda.'

export function mensajeDeError(error) {
  const texto = String(error?.message || '')
  const esDueno = error?.status === 409 || error?.code === 'OWNER_HAS_STORE' || /tienda|due[ñn]o|owner/i.test(texto)
  if (esDueno) return { dueno: true, texto: `${AYUDA_DUENO} ${texto && !/^La API respondió/.test(texto) ? texto : ''}`.trim() }
  return { dueno: false, texto: texto || 'No se pudo eliminar la cuenta. Probá de nuevo.' }
}
