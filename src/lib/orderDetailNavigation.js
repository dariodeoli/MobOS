// Only a confirmed order may navigate; offline queue entries never call this.
export function orderDetailPath(order, savedContext, currentContext, pathname) {
  if (!order?.id || order.error || order.ok === false || pathname !== '/pos') return null
  if (!savedContext?.empresaId || !savedContext?.userId) return null
  for (const key of ['empresaId', 'sucursalId', 'userId']) {
    if (savedContext[key] !== currentContext?.[key]) return null
  }
  return `/pedidos/${encodeURIComponent(order.id)}`
}
