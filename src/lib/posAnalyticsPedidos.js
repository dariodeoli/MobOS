import { diaDe } from './posAnalytics.js'

// El listado está ordenado del más nuevo al más viejo. Seguir el cursor evita
// presentar como total del día solamente los primeros 500 pedidos (#353).
export async function cargarPedidosParaAnalisis(get, desde, signal) {
  const pedidos = []
  let cursor
  while (true) {
    signal?.throwIfAborted()
    const params = new URLSearchParams({ filtro: 'todos', limit: '500' })
    if (cursor) params.set('cursor', cursor)
    const filas = await get(`/api/orders?${params}`, { signal })
    if (!Array.isArray(filas)) throw new Error('No se pudieron leer las ventas del período.')
    pedidos.push(...filas.filter(fila => diaDe(fila.createdAt) >= desde))
    const ultima = filas.at(-1)
    if (filas.length < 500 || diaDe(ultima?.createdAt) < desde) return pedidos
    if (!ultima?.id || ultima.id === cursor) throw new Error('No se pudo completar la lectura de las ventas.')
    cursor = ultima.id
  }
}
