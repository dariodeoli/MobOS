// #250 Fase 6 (Centro de Abastecimiento): automatización — reposición sugerida
// (con stock de seguridad y plazo de entrega), rendimiento por proveedor,
// tiempos de tránsito (CDE→ASU) y alertas de atraso. Lógica pura y testeable;
// las rutas solo agregan los datos.

/** Días entre dos fechas (null si falta alguna). */
function diasEntre(desde: unknown, hasta: unknown): number | null {
  if (!desde || !hasta) return null
  const inicio = new Date(String(desde))
  const fin = new Date(String(hasta))
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null
  return Math.max(0, (fin.getTime() - inicio.getTime()) / 86400000)
}

const redondear = (valor: number, decimales = 1) => Number(valor.toFixed(decimales))

export type PoliticaReposicion = { safetyStock?: number | null; leadTimeDays?: number | null }

/**
 * Reposición sugerida: punto de pedido = stock de seguridad + días de venta del
 * plazo de entrega; se descuenta lo que ya viene en camino y lo que ya está
 * pedido (necesidades abiertas). Nunca sugiere si no falta nada.
 */
export function reposicionSugerida({ stock = 0, safetyStock = 0, leadTimeDays = 7, consumoDiario = 0, enCamino = 0, abiertas = 0 }: { stock?: number; safetyStock?: number; leadTimeDays?: number; consumoDiario?: number; enCamino?: number; abiertas?: number }): { disponible: number; puntoPedido: number; sugerida: number; urgencia: 'ALTA' | 'MEDIA' | 'BAJA'; motivo: string } {
  const colchon = Math.max(0, Math.round(Number(safetyStock) || 0))
  const plazo = Math.max(0, Math.round(Number(leadTimeDays) || 0))
  const consumo = Math.max(0, Number(consumoDiario) || 0)
  const stockActual = Math.max(0, Math.round(Number(stock) || 0))
  const puntoPedido = Math.ceil(colchon + consumo * plazo)
  const disponible = stockActual + Math.max(0, Math.round(Number(enCamino) || 0)) + Math.max(0, Math.round(Number(abiertas) || 0))
  const sugerida = Math.max(0, puntoPedido - disponible)
  const urgencia = stockActual <= colchon ? 'ALTA' : stockActual <= puntoPedido ? 'MEDIA' : 'BAJA'
  const motivo = sugerida === 0
    ? `Stock ${stockActual} cubierto (punto de pedido ${puntoPedido}).`
    : `Stock ${stockActual} bajo el punto de pedido ${puntoPedido} (seguridad ${colchon} + ${redondear(consumo, 2)}/día × ${plazo} días)${enCamino ? `; ${enCamino} en camino` : ''}${abiertas ? ` y ${abiertas} pedidas` : ''}.`
  return { disponible, puntoPedido, sugerida, urgencia, motivo }
}

export type CompraProveedor = {
  supplierId: string | null
  supplierName: string
  unidades: number
  costPyg: number
  creadaEl: string | Date | null
  despachadaEl?: string | Date | null
  recibidaEl?: string | Date | null
  etaEl?: string | Date | null
  faltantes?: number
  incidencias?: number
  lotes?: number
}

/**
 * Rendimiento por proveedor: compras, unidades, monto, plazo promedio de
 * reposición (compra → recepción), puntualidad (lotes que llegaron dentro de la
 * ETA) y tasa de problemas (faltantes/incidencias por unidades).
 */
export function rendimientoProveedor(compras: CompraProveedor[] = []): Array<{ supplierId: string | null; proveedor: string; compras: number; unidades: number; costPyg: number; plazoPromedioDias: number | null; puntualidadPct: number | null; faltantesPct: number; incidencias: number }> {
  const porProveedor = new Map<string, { supplierId: string | null; proveedor: string; compras: number; unidades: number; costPyg: number; plazos: number[]; lotesConEta: number; lotesEnTiempo: number; faltantes: number; incidencias: number }>()
  for (const compra of compras || []) {
    const clave = compra.supplierId || `nombre:${compra.supplierName}`
    const fila = porProveedor.get(clave) || { supplierId: compra.supplierId || null, proveedor: compra.supplierName || 'Sin proveedor', compras: 0, unidades: 0, costPyg: 0, plazos: [], lotesConEta: 0, lotesEnTiempo: 0, faltantes: 0, incidencias: 0 }
    fila.compras += 1
    fila.unidades += Math.max(0, Math.round(Number(compra.unidades) || 0))
    fila.costPyg += Math.max(0, Math.round(Number(compra.costPyg) || 0))
    const plazo = diasEntre(compra.creadaEl, compra.recibidaEl)
    if (plazo !== null) fila.plazos.push(plazo)
    if (compra.etaEl && compra.recibidaEl) {
      fila.lotesConEta += 1
      if (new Date(String(compra.recibidaEl)).getTime() <= new Date(String(compra.etaEl)).getTime()) fila.lotesEnTiempo += 1
    }
    fila.faltantes += Math.max(0, Math.round(Number(compra.faltantes) || 0))
    fila.incidencias += Math.max(0, Math.round(Number(compra.incidencias) || 0))
    porProveedor.set(clave, fila)
  }
  return [...porProveedor.values()]
    .map((fila) => ({
      supplierId: fila.supplierId,
      proveedor: fila.proveedor,
      compras: fila.compras,
      unidades: fila.unidades,
      costPyg: fila.costPyg,
      plazoPromedioDias: fila.plazos.length ? redondear(fila.plazos.reduce((suma, valor) => suma + valor, 0) / fila.plazos.length) : null,
      puntualidadPct: fila.lotesConEta ? Math.round((fila.lotesEnTiempo / fila.lotesConEta) * 100) : null,
      faltantesPct: fila.unidades ? redondear((fila.faltantes / fila.unidades) * 100) : 0,
      incidencias: fila.incidencias,
    }))
    .sort((a, b) => b.compras - a.compras)
}

export type LoteTransito = {
  origen: string
  destino: string | null
  metodo: string
  salidaEl?: string | Date | null
  llegadaEl?: string | Date | null
  etaEl?: string | Date | null
  estado?: string | null
  unidades?: number
}

/** Tiempo real de tránsito por ruta y método (incluye CDE→ASU) y atraso promedio. */
export function tiemposDeTransito(lotes: LoteTransito[] = []): Array<{ ruta: string; origen: string; destino: string | null; metodo: string; lotes: number; unidades: number; diasPromedio: number | null; diasMaximos: number | null }> {
  const porRuta = new Map<string, { origen: string; destino: string | null; metodo: string; dias: number[]; lotes: number; unidades: number }>()
  for (const lote of lotes || []) {
    const clave = `${lote.origen}→${lote.destino || '—'}·${lote.metodo}`
    const fila = porRuta.get(clave) || { origen: lote.origen, destino: lote.destino || null, metodo: lote.metodo, dias: [], lotes: 0, unidades: 0 }
    fila.lotes += 1
    fila.unidades += Math.max(0, Math.round(Number(lote.unidades) || 0))
    const dias = diasEntre(lote.salidaEl, lote.llegadaEl)
    if (dias !== null) fila.dias.push(dias)
    porRuta.set(clave, fila)
  }
  return [...porRuta.values()]
    .map((fila) => ({
      ruta: `${fila.origen} → ${fila.destino || '—'}`,
      origen: fila.origen,
      destino: fila.destino,
      metodo: fila.metodo,
      lotes: fila.lotes,
      unidades: fila.unidades,
      diasPromedio: fila.dias.length ? redondear(fila.dias.reduce((suma, valor) => suma + valor, 0) / fila.dias.length) : null,
      diasMaximos: fila.dias.length ? redondear(Math.max(...fila.dias)) : null,
    }))
    .sort((a, b) => b.lotes - a.lotes)
}

/** Alertas de atraso: lotes sin llegar con la ETA vencida y necesidades con fecha prometida pasada. */
export function enviosAtrasados({ envios = [], ahora = new Date() }: { envios?: Array<{ id?: string; code: string; origen?: string; destino?: string | null; metodo?: string; estado?: string; etaEl?: string | Date | null }>; ahora?: Date | string }): Array<{ code: string; origen: string | null; destino: string | null; metodo: string | null; estado: string | null; eta: string | null; diasAtraso: number }> {
  const referencia = new Date(ahora)
  return (envios || [])
    .filter((envio) => envio?.etaEl)
    .map((envio) => ({ envio, dias: diasEntre(envio.etaEl, referencia) ?? 0 }))
    .filter((fila) => fila.dias > 0)
    .map((fila) => ({
      code: fila.envio.code,
      origen: fila.envio.origen || null,
      destino: fila.envio.destino || null,
      metodo: fila.envio.metodo || null,
      estado: fila.envio.estado || null,
      eta: fila.envio.etaEl ? new Date(String(fila.envio.etaEl)).toISOString() : null,
      diasAtraso: Math.floor(fila.dias),
    }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)
}

/** Necesidades con la fecha prometida al cliente ya vencida (y por cuánto). */
export function necesidadesAtrasadas({ necesidades = [], ahora = new Date() }: { necesidades?: Array<{ id: string; productId?: string | null; producto?: string | null; branchId?: string | null; sucursal?: string | null; quantity?: number; prioridad?: string | null; prometidaEn?: string | Date | null; orderId?: string | null; source?: string | null }>; ahora?: Date | string }): Array<{ id: string; productId: string | null; producto: string | null; branchId: string | null; sucursal: string | null; quantity: number; prioridad: string | null; prometidaEn: string; diasVencidos: number; orderId: string | null; source: string | null }> {
  const referencia = new Date(ahora)
  return (necesidades || [])
    .filter((necesidad) => necesidad?.prometidaEn)
    .map((necesidad) => ({ necesidad, dias: diasEntre(necesidad.prometidaEn, referencia) ?? 0 }))
    .filter((fila) => fila.dias > 0)
    .map((fila) => ({
      id: fila.necesidad.id,
      productId: fila.necesidad.productId || null,
      producto: fila.necesidad.producto || null,
      branchId: fila.necesidad.branchId || null,
      sucursal: fila.necesidad.sucursal || null,
      quantity: Math.max(0, Math.round(Number(fila.necesidad.quantity) || 0)),
      prioridad: fila.necesidad.prioridad || null,
      prometidaEn: new Date(String(fila.necesidad.prometidaEn)).toISOString(),
      diasVencidos: Math.floor(fila.dias),
      orderId: fila.necesidad.orderId || null,
      source: fila.necesidad.source || null,
    }))
    .sort((a, b) => b.diasVencidos - a.diasVencidos)
}
