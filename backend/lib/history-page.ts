// Paginado por desplazamiento para las cronologías (proveedor, funcionario):
// `?limit=` (1-100) y `?offset=`; devuelve `nextOffset` cuando hay más. Las
// rutas sin `limit` conservan el contrato anterior (hasta 300 eventos).

export function paginaDeEventos<T>(eventos: T[], params: URLSearchParams) {
  const pedido = Number(params.get('limit'))
  const limit = Number.isFinite(pedido) && pedido > 0 ? Math.min(100, Math.floor(pedido)) : 25
  const offsetPedido = Number(params.get('offset'))
  const offset = Number.isFinite(offsetPedido) && offsetPedido > 0 ? Math.floor(offsetPedido) : 0
  const pagina = eventos.slice(offset, offset + limit)
  return { events: pagina, nextOffset: offset + limit < eventos.length ? offset + limit : null, total: eventos.length }
}
