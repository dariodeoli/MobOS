// Adaptador de identidad para las pantallas del pedido (#212), preparado para
// consumir el objeto unificado de DSN (#211) sin cambiar las pantallas: acepta
// los nombres de campo habituales (name/nombre, picture/avatarUrl/foto,
// hasAvatar/tieneFoto) y normaliza nombre visible + primer nombre + foto.
import { primerNombre } from './utils.js'

const primerTexto = (...valores) => {
  for (const valor of valores) {
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
  }
  return ''
}

export function identidadDeUsuario(fuente = {}) {
  const objeto = fuente && typeof fuente === 'object' ? fuente : {}
  const nombre =
    primerTexto(objeto.nombre, objeto.name, objeto.displayName, objeto.fullName) ||
    primerTexto(objeto.email) ||
    'Sistema'
  return {
    nombre,
    primerNombre: primerNombre(nombre) || 'Sistema',
    // Foto: la local manda; si no, la de Google; sin ninguna, iniciales.
    picture: primerTexto(objeto.picture, objeto.avatarUrl, objeto.foto, objeto.photoURL),
    hasAvatar: objeto.hasAvatar ?? objeto.tieneFoto ?? undefined,
  }
}
