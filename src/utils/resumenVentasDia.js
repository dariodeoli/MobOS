// Métricas del día del POS (#148 §7, #187): la demo guarda una fila por unidad
// de la misma venta (todas con el mismo `compraId`), así que «ventas» y
// «pedidos» se cuentan por orden y no por fila. Una fila sin `compraId` (venta
// de una sola unidad) es su propia orden.
export function ordenesDeVentas(filas = []) {
  const ordenes = new Map()
  filas.forEach((fila, indice) => {
    const clave = fila?.compraId || fila?.id || `suelta-${indice}`
    if (!ordenes.has(clave)) ordenes.set(clave, fila)
  })
  return [...ordenes.values()]
}
