// Comentarios internos de los pedidos de la demo: viven en la memoria de la
// pestaña (demoStorage), nunca salen a la red y se descartan al recargar.
// Tienen la misma forma que los eventos `comment` de `/api/orders/:id/history`.
import { guardarDemo, leerDemo } from '../demoStorage.js'

const clave = (pedidoId) => `mobos:demo:pedido-comentarios:${pedidoId}`
// Sin almacenamiento disponible (o fuera del navegador) los comentarios viven en esta memoria.
const respaldo = new Map()
const leer = (id) => leerDemo(clave(id)) ?? respaldo.get(id) ?? null
export const LARGO_MAXIMO_COMENTARIO = 2000

/** Quita caracteres de control y recorta; devuelve '' si no queda texto. */
export function limpiarComentario(texto) {
  return String(texto ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, LARGO_MAXIMO_COMENTARIO)
}

export function comentariosDemo(pedidoId) {
  if (!pedidoId) return []
  try {
    const lista = JSON.parse(leer(pedidoId) || '[]')
    return Array.isArray(lista) ? lista : []
  } catch { return [] }
}

/** Agrega un comentario y devuelve el evento, o null si el texto está vacío. */
export function agregarComentarioDemo(pedidoId, { texto, usuario, ahora = new Date() } = {}) {
  const body = limpiarComentario(texto)
  if (!pedidoId || !body) return null
  const evento = {
    id: `demo-comentario-${ahora.getTime().toString(36)}-${comentariosDemo(pedidoId).length}`,
    type: 'comment',
    at: ahora.toISOString(),
    body,
    photos: [],
    user: { id: usuario?.id || 'demo-user', name: usuario?.name || usuario?.nombre || 'Equipo demo', hasAvatar: usuario?.hasAvatar },
  }
  const texto2 = JSON.stringify([...comentariosDemo(pedidoId), evento])
  respaldo.set(pedidoId, texto2)
  guardarDemo(clave(pedidoId), texto2)
  return evento
}

/** Cronología de la demo con sus comentarios locales, el más reciente primero. */
export function conComentariosDemo(pedidoId, eventos = []) {
  return [...eventos, ...comentariosDemo(pedidoId)].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
