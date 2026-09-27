// IMEI diferido del lote (#250 F3): el envío guarda una unidad por equipo y la
// completa antes de despachar o en tránsito. Acá vive el agrupado que usa el
// panel (`Preparar lote`) para mostrar las pendientes por línea de compra.
export function pendientesDeEnvio(envio) {
  const items = (envio?.items || []).filter((item) => !item.serial)
  const lineas = new Map()
  for (const item of items) {
    const clave = item.lineId || item.productId || item.id
    if (!lineas.has(clave)) {
      lineas.set(clave, {
        id: clave,
        lineId: item.lineId || null,
        productId: item.productId || null,
        producto: item.product?.name || '',
        capacidad: item.product?.capacity || '',
        color: item.product?.color || '',
        cantidad: 0,
        itemIds: [],
      })
    }
    const fila = lineas.get(clave)
    fila.cantidad += 1
    fila.itemIds.push(item.id)
  }
  return [...lineas.values()]
}

// Seriales ya cargados en el lote para una línea (el aviso previo del pegado).
export function serialesDeEnvio(envio, lineId) {
  return (envio?.items || [])
    .filter((item) => item.serial && (!lineId || item.lineId === lineId))
    .map((item) => item.serial)
}

export function totalPendienteLotes(envios = []) {
  return envios.reduce((suma, envio) => suma + Number(envio?.pendientes || 0), 0)
}

export function etiquetaLineaDeLote(linea) {
  return [linea?.producto || 'Producto', linea?.capacidad, linea?.color].filter(Boolean).join(' · ')
}
