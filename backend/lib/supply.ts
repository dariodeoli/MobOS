// #250 Fase 1 (Centro de Abastecimiento): necesidades de abastecimiento.
//
// Lógica pura y testeable del panel «Por comprar»: orígenes/prioridades/estados
// válidos, normalización de la carga manual y **consolidación inteligente**
// (agrupa solicitudes idénticas para comprar conservando los destinos — pedido,
// reserva o reposición — y sin mezclar condición, que es la variante a comprar).

import { normalizarCosto } from './costs'
import { validarImei } from './imeicheck'

export const NECESIDAD_ORIGENES = ['SALE_NO_STOCK', 'RESERVATION_NO_STOCK', 'QUANTITY_OVER_STOCK', 'BELOW_REORDER', 'ORDER_COMMITTED', 'MANUAL'] as const
export type NecesidadOrigen = (typeof NECESIDAD_ORIGENES)[number]

// Solo la carga a mano entra por la API en Fase 1; el resto son automatismos
// (Fase 2) que comparten el mismo registro.
export const ORIGENES_AUTOMATICOS: NecesidadOrigen[] = ['SALE_NO_STOCK', 'RESERVATION_NO_STOCK', 'QUANTITY_OVER_STOCK', 'BELOW_REORDER', 'ORDER_COMMITTED']

export const NECESIDAD_ORIGEN_LABEL: Record<NecesidadOrigen, string> = {
  SALE_NO_STOCK: 'Venta sin stock',
  RESERVATION_NO_STOCK: 'Reserva sin stock',
  QUANTITY_OVER_STOCK: 'Cantidad mayor al stock',
  BELOW_REORDER: 'Bajo punto de reposición',
  ORDER_COMMITTED: 'Pedido comprometido',
  MANUAL: 'Carga manual',
}

export const NECESIDAD_PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const
export type NecesidadPrioridad = (typeof NECESIDAD_PRIORIDADES)[number]
const PESO_PRIORIDAD: Record<string, number> = { BAJA: 1, NORMAL: 2, ALTA: 3, URGENTE: 4 }

export const NECESIDAD_ESTADOS = ['ABIERTA', 'ASIGNADA', 'COMPRADA', 'RECIBIDA', 'CANCELADA'] as const
export type NecesidadEstado = (typeof NECESIDAD_ESTADOS)[number]

/** Prioridad más alta de dos (para consolidar). */
export function prioridadMayor(a: string, b: string): NecesidadPrioridad {
  return (PESO_PRIORIDAD[a] || 0) >= (PESO_PRIORIDAD[b] || 0) ? (a as NecesidadPrioridad) : (b as NecesidadPrioridad)
}

export function pesoPrioridad(prioridad: string): number {
  return PESO_PRIORIDAD[prioridad] || 0
}

const fecha = (valor: unknown): string | null => {
  if (valor === null || valor === undefined || valor === '') return null
  const cuando = valor instanceof Date ? valor : new Date(String(valor))
  return Number.isNaN(cuando.getTime()) ? null : cuando.toISOString()
}

/** Fecha más próxima (para consolidar). */
function fechaMasProxima(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

export type NecesidadEntrada = {
  id: string
  productId: string
  producto?: string | null
  condicion?: string | null
  cantidad: number
  prioridad: string
  origen: string
  prometidaEl?: string | Date | null
  sucursalId?: string | null
  sucursal?: string | null
  pedidoId?: string | null
  pedidoNumero?: string | null
  clienteId?: string | null
  cliente?: string | null
}

export type DestinoConsolidado = {
  tipo: 'PEDIDO' | 'STOCK'
  etiqueta: string
  cantidad: number
  sucursalId: string | null
  sucursal: string | null
  pedidoId: string | null
  pedidoNumero: string | null
  clienteId: string | null
  cliente: string | null
  prometidaEl: string | null
}

export type GrupoConsolidado = {
  productoId: string
  producto: string
  condicion: string
  cantidad: number
  prioridad: NecesidadPrioridad
  prometidaEl: string | null
  origenes: string[]
  destinos: DestinoConsolidado[]
  necesidades: string[]
}

/**
 * Consolidación del panel «Por comprar» (#250 §5): agrupa por producto +
 * condición, suma cantidades, deja la prioridad más alta y la fecha prometida
 * más próxima, y conserva los destinos (un pedido, una reserva o reposición de
 * una sucursal) sin mezclarlos nunca entre sí.
 */
export function consolidarNecesidades(necesidades: NecesidadEntrada[] = []): GrupoConsolidado[] {
  const grupos = new Map<string, GrupoConsolidado & { destinosMapa: Map<string, DestinoConsolidado> }>()
  for (const necesidad of necesidades) {
    if (!necesidad || !necesidad.productId) continue
    const condicion = String(necesidad.condicion || 'NEW').toUpperCase()
    const clave = `${necesidad.productId}::${condicion}`
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = {
        productoId: necesidad.productId,
        producto: necesidad.producto || '',
        condicion,
        cantidad: 0,
        prioridad: 'NORMAL',
        prometidaEl: null,
        origenes: [],
        destinos: [],
        necesidades: [],
        destinosMapa: new Map(),
      }
      grupos.set(clave, grupo)
    }
    const cantidad = Number(necesidad.cantidad) > 0 ? Math.round(Number(necesidad.cantidad)) : 1
    grupo.cantidad += cantidad
    grupo.prioridad = prioridadMayor(grupo.prioridad, necesidad.prioridad)
    grupo.prometidaEl = fechaMasProxima(grupo.prometidaEl, fecha(necesidad.prometidaEl))
    if (!grupo.origenes.includes(necesidad.origen)) grupo.origenes.push(necesidad.origen)
    grupo.necesidades.push(necesidad.id)
    if (!grupo.producto && necesidad.producto) grupo.producto = necesidad.producto

    // Destino: el pedido (con cliente) o la reposición de una sucursal.
    const claveDestino = necesidad.pedidoId ? `pedido:${necesidad.pedidoId}` : `stock:${necesidad.sucursalId || ''}`
    const destino = grupo.destinosMapa.get(claveDestino)
    if (destino) {
      destino.cantidad += cantidad
      destino.prometidaEl = fechaMasProxima(destino.prometidaEl, fecha(necesidad.prometidaEl))
    } else {
      const esPedido = Boolean(necesidad.pedidoId)
      grupo.destinosMapa.set(claveDestino, {
        tipo: esPedido ? 'PEDIDO' : 'STOCK',
        etiqueta: esPedido
          ? `Pedido ${necesidad.pedidoNumero || 'sin número'}${necesidad.cliente ? ` · ${necesidad.cliente}` : ''}`
          : `Reposición${necesidad.sucursal ? ` · ${necesidad.sucursal}` : ''}`,
        cantidad,
        sucursalId: necesidad.sucursalId || null,
        sucursal: necesidad.sucursal || null,
        pedidoId: necesidad.pedidoId || null,
        pedidoNumero: necesidad.pedidoNumero || null,
        clienteId: necesidad.clienteId || null,
        cliente: necesidad.cliente || null,
        prometidaEl: fecha(necesidad.prometidaEl),
      })
    }
  }
  return [...grupos.values()]
    .map(({ destinosMapa, ...grupo }) => ({ ...grupo, destinos: [...destinosMapa.values()] }))
    .sort((a, b) => pesoPrioridad(b.prioridad) - pesoPrioridad(a.prioridad)
      || new Date(a.prometidaEl || '2999-12-31').getTime() - new Date(b.prometidaEl || '2999-12-31').getTime()
      || b.cantidad - a.cantidad)
}

export type NecesidadManual = {
  productId: string
  branchId: string | null
  quantity: number
  condition: string
  priority: string
  promisedAt: string | null
  notes: string | null
}

/** Normaliza y valida la carga manual de una necesidad (POST de la API). */
export function normalizarNecesidadManual(body: unknown): { ok: true; data: NecesidadManual } | { ok: false; error: string } {
  const fila = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const productId = typeof fila.productId === 'string' && fila.productId.trim() ? fila.productId.trim().slice(0, 128) : ''
  if (!productId) return { ok: false, error: 'Indicá el producto de la necesidad.' }
  const quantity = Number(fila.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return { ok: false, error: 'La cantidad debe ser un entero entre 1 y 9999.' }
  const condition = typeof fila.condition === 'string' && fila.condition.trim() ? fila.condition.trim().toUpperCase() : 'NEW'
  if (!['NEW', 'USED', 'REFURBISHED'].includes(condition)) return { ok: false, error: 'Condición inválida.' }
  const priority = typeof fila.priority === 'string' && fila.priority.trim() ? fila.priority.trim().toUpperCase() : 'NORMAL'
  if (!(NECESIDAD_PRIORIDADES as readonly string[]).includes(priority)) return { ok: false, error: 'Prioridad inválida.' }
  const promisedAtCrudo = fila.promisedAt
  const promisedAt = fecha(promisedAtCrudo)
  if (promisedAtCrudo !== undefined && promisedAtCrudo !== null && promisedAtCrudo !== '' && !promisedAt) return { ok: false, error: 'La fecha prometida no es válida.' }
  const notes = typeof fila.notes === 'string' && fila.notes.trim() ? fila.notes.trim().slice(0, 500) : null
  const branchId = typeof fila.branchId === 'string' && fila.branchId.trim() ? fila.branchId.trim().slice(0, 128) : null
  return { ok: true, data: { productId, branchId, quantity, condition, priority, promisedAt, notes } }
}

// ── Fase 2 (#250 §6): compra rápida y stock adicional ───────────────────────

// Estados de la compra: F2 usa COMPRADA/CANCELADA; F4 (lotes) suma PREPARANDO/
// EN_TRANSITO y F5 (recepción) RECIBIDA. El stock no se mueve en ningún estado
// de esta fase.
export const COMPRA_ESTADOS = ['COMPRADA', 'CANCELADA'] as const
export type CompraEstado = (typeof COMPRA_ESTADOS)[number]

/**
 * Identificador compartido (#250 §2): el mismo número viaja al panel, al
 * ticket, a la etiqueta y a la recepción (`COM-CDE-0048`).
 */
export function codigoCompra({ origen = 'CDE', destino = '', secuencia }: { origen?: string; destino?: string; secuencia: number }): string {
  const tramo = (valor: string) => String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'CDE'
  const numero = String(Math.max(1, Math.round(Number(secuencia) || 1))).padStart(4, '0')
  return `COM-${tramo(origen)}${destino ? `-${tramo(destino)}` : ''}-${numero}`
}

const SERIAL_MAX = 64

/**
 * Limpia los IMEI/seriales de una línea: acepta lista o texto pegado (comas,
 * espacios o saltos), sube a mayúsculas, descarta repetidos y valida el dígito
 * verificador (Luhn) de los IMEI de 15 dígitos. Los seriales de producto que no
 * son IMEI viajan tal cual (mismo criterio que el resto de la app).
 */
export function normalizarSeriales(valor: unknown): { ok: true; seriales: string[] } | { ok: false; error: string } {
  const crudos = Array.isArray(valor) ? valor : typeof valor === 'string' ? valor.split(/[\s,;]+/) : []
  const seriales: string[] = []
  const vistos = new Set<string>()
  for (const crudo of crudos) {
    const serial = String(crudo ?? '').trim().toUpperCase().slice(0, SERIAL_MAX)
    if (!serial) continue
    if (vistos.has(serial)) return { ok: false, error: `El serial ${serial} está repetido en la compra.` }
    if (/^\d{15}$/.test(serial)) {
      const valido = validarImei(serial)
      if (!valido.ok) return { ok: false, error: `El IMEI ${serial} no pasa la verificación de dígito control (Luhn).` }
    } else if (!/^[A-Z0-9-]{4,}$/.test(serial)) {
      return { ok: false, error: `El serial ${serial} no parece válido.` }
    }
    vistos.add(serial)
    seriales.push(serial)
  }
  return { ok: true, seriales }
}

export type LineaCompra = {
  needId: string | null
  productId: string
  condition: string
  quantity: number
  unitCostPyg: number | null
  serials: string[]
}

export type CompraNormalizada = {
  code: string | null
  branchId: string | null
  supplierId: string | null
  supplierName: string
  currency: string
  originalCost: number | null
  exchangeRatePyg: number | null
  costPyg: number | null
  reference: string | null
  notes: string | null
  lines: LineaCompra[]
}

/**
 * Normaliza la compra rápida: proveedor (ficha o nombre), costo/moneda con las
 * reglas compartidas (`normalizarCosto`), referencia/factura, líneas con
 * cantidad y —si ya se conocen— los IMEI. La foto de la factura se adjunta
 * después con la API de adjuntos (`entity=SUPPLY_PURCHASE`).
 */
export function normalizarCompra(body: unknown): { ok: true; data: CompraNormalizada } | { ok: false; error: string } {
  const fila = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const supplierId = typeof fila.supplierId === 'string' && fila.supplierId.trim() ? fila.supplierId.trim().slice(0, 128) : null
  const supplierName = typeof fila.supplierName === 'string' && fila.supplierName.trim() ? fila.supplierName.trim().slice(0, 160) : ''
  if (!supplierId && !supplierName) return { ok: false, error: 'Indicá el proveedor de la compra.' }

  const currency = typeof fila.currency === 'string' && fila.currency.trim() ? fila.currency.trim().toUpperCase() : 'PYG'
  if (!['PYG', 'USD'].includes(currency)) return { ok: false, error: 'Moneda inválida: usá PYG o USD.' }
  // El costo es opcional: una compra puede registrarse sin monto (se completa
  // al recibir la factura).
  const sinCosto = [fila.originalCost, fila.exchangeRatePyg].every((valor) => valor === undefined || valor === null || valor === '')
  let costo: { costPyg: number | null; originalCost: number | null; exchangeRatePyg: number | null } = { costPyg: null, originalCost: null, exchangeRatePyg: null }
  if (!sinCosto) {
    try {
      costo = normalizarCosto({ costCurrency: currency as never, originalCost: fila.originalCost === undefined ? undefined : Number(fila.originalCost), exchangeRatePyg: fila.exchangeRatePyg === undefined ? undefined : Number(fila.exchangeRatePyg) })
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : 'Costo inválido.' }
    }
  }

  const lineasCrudas = Array.isArray(fila.lines) ? fila.lines : []
  if (!lineasCrudas.length) return { ok: false, error: 'La compra necesita al menos una línea.' }
  if (lineasCrudas.length > 100) return { ok: false, error: 'Demasiadas líneas en la compra (máximo 100).' }
  const lines: LineaCompra[] = []
  for (const cruda of lineasCrudas) {
    const linea = cruda && typeof cruda === 'object' && !Array.isArray(cruda) ? (cruda as Record<string, unknown>) : {}
    const productId = typeof linea.productId === 'string' && linea.productId.trim() ? linea.productId.trim().slice(0, 128) : ''
    if (!productId) return { ok: false, error: 'Cada línea necesita un producto.' }
    const quantity = Number(linea.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return { ok: false, error: 'La cantidad de cada línea debe ser un entero entre 1 y 9999.' }
    const condition = typeof linea.condition === 'string' && linea.condition.trim() ? linea.condition.trim().toUpperCase() : 'NEW'
    if (!['NEW', 'USED', 'REFURBISHED'].includes(condition)) return { ok: false, error: 'Condición inválida en una línea.' }
    const seriales = normalizarSeriales(linea.serials)
    if (!seriales.ok) return { ok: false, error: seriales.error }
    if (seriales.seriales.length > quantity) return { ok: false, error: `La línea trae ${seriales.seriales.length} seriales para ${quantity} unidad(es).` }
    const unitCostPyg = linea.unitCostPyg === undefined || linea.unitCostPyg === null || linea.unitCostPyg === '' ? null : Number(linea.unitCostPyg)
    if (unitCostPyg !== null && (!Number.isSafeInteger(unitCostPyg) || unitCostPyg < 0)) return { ok: false, error: 'El costo unitario debe ser un entero en guaraníes.' }
    lines.push({
      needId: typeof linea.needId === 'string' && linea.needId.trim() ? linea.needId.trim().slice(0, 128) : null,
      productId,
      condition,
      quantity,
      unitCostPyg,
      serials: seriales.seriales,
    })
  }

  const codeCrudo = typeof fila.code === 'string' ? fila.code.trim().toUpperCase() : ''
  if (codeCrudo && !/^[A-Z0-9-]{4,32}$/.test(codeCrudo)) return { ok: false, error: 'El código de la compra no es válido.' }
  const reference = typeof fila.reference === 'string' && fila.reference.trim() ? fila.reference.trim().slice(0, 120) : null
  const notes = typeof fila.notes === 'string' && fila.notes.trim() ? fila.notes.trim().slice(0, 500) : null
  const branchId = typeof fila.branchId === 'string' && fila.branchId.trim() ? fila.branchId.trim().slice(0, 128) : null

  return {
    ok: true,
    data: {
      code: codeCrudo || null,
      branchId,
      supplierId,
      supplierName,
      currency,
      originalCost: costo.originalCost,
      exchangeRatePyg: costo.exchangeRatePyg,
      costPyg: costo.costPyg,
      reference,
      notes,
      lines,
    },
  }
}

// ── Fase 3 (#250 §7 y §11): IMEI y preparación ──────────────────────────────

/**
 * Cuadre de los seriales de una línea: normaliza (Luhn y repetidos dentro del
 * lote), descarta los ya cargados y valida que no se pase de la cantidad
 * comprada. Es el mismo camino para el pegado múltiple y para el escaneo de a
 * uno (escaneo móvil).
 */
export function cuadrarSeriales({ seriales, cantidad, yaEnLinea = [] }: { seriales: unknown; cantidad: number; yaEnLinea?: string[] }): { ok: true; nuevos: string[] } | { ok: false; error: string } {
  const normalizados = normalizarSeriales(seriales)
  if (!normalizados.ok) return { ok: false, error: normalizados.error }
  if (!normalizados.seriales.length) return { ok: false, error: 'Indicá al menos un IMEI/serial.' }
  const cargados = new Set(yaEnLinea.map((serial) => String(serial).toUpperCase()))
  const nuevos: string[] = []
  for (const serial of normalizados.seriales) {
    if (cargados.has(serial) || nuevos.includes(serial)) return { ok: false, error: `El IMEI ${serial} ya está cargado en esta línea.` }
    nuevos.push(serial)
  }
  const total = Math.round(Number(cantidad) || 0)
  if (cargados.size + nuevos.length > total) {
    return { ok: false, error: `La línea admite ${total} IMEI/serial (ya tiene ${cargados.size}).` }
  }
  return { ok: true, nuevos }
}

const normalizarTexto = (valor: unknown) => String(valor ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * Producto esperado vs detectado (#250 §7): comparación tolerante — el modelo
 * del panel (`iPhone 15 Pro Max`) tiene que estar contenido en el nombre del
 * producto de la línea (o al revés). Sin dato del proveedor no hay aviso.
 */
export function compararModelo(esperado: unknown, detectado: unknown): { coincide: boolean; esperado: string; detectado: string } | null {
  const linea = normalizarTexto(esperado)
  const imei = normalizarTexto(detectado)
  if (!linea || !imei) return null
  return { coincide: linea.includes(imei) || imei.includes(linea), esperado: String(esperado), detectado: String(detectado) }
}

export type EtiquetaPreparacion = {
  n: number
  total: number
  producto: string
  capacidad: string
  condicion: string
  imei: string | null
  pendiente: boolean
  compra: string
  referencia: string | null
  pedido: string | null
  destino: string | null
  lote: string | null
}

export type LineaParaEtiquetas = {
  productId: string
  producto?: string | null
  capacidad?: string | null
  condicion?: string | null
  quantity: number
  serials?: string[]
  pedidoNumero?: string | null
}

/**
 * Etiquetas de la preparación (#250 §11): una por unidad comprada, con
 * `PRODUCTO n DE N`, variante, el IMEI (o «pendiente» si todavía no se cargó),
 * la compra, el pedido vinculado y el destino. PRN pone el layout impreso; este
 * contrato es el que consume.
 */
export function etiquetasPreparacion({ compra, lineas = [], destino = null, lote = null }: { compra: string; lineas?: LineaParaEtiquetas[]; destino?: string | null; lote?: string | null }): EtiquetaPreparacion[] {
  const total = lineas.reduce((suma, linea) => suma + Math.max(0, Math.round(Number(linea.quantity) || 0)), 0)
  const etiquetas: EtiquetaPreparacion[] = []
  let n = 0
  for (const linea of lineas) {
    const cantidad = Math.max(0, Math.round(Number(linea.quantity) || 0))
    const seriales = Array.isArray(linea.serials) ? linea.serials : []
    for (let i = 0; i < cantidad; i += 1) {
      n += 1
      const imei = seriales[i] ? String(seriales[i]).toUpperCase() : null
      etiquetas.push({
        n,
        total,
        producto: String(linea.producto || ''),
        capacidad: String(linea.capacidad || ''),
        condicion: String(linea.condicion || 'NEW'),
        imei,
        pendiente: !imei,
        compra,
        referencia: null,
        pedido: linea.pedidoNumero || null,
        destino,
        lote,
      })
    }
  }
  return etiquetas
}

/** Resumen de preparación: cuántas unidades tienen IMEI y cuántas faltan. */
export function resumenPreparacion(lineas: Array<{ quantity: number; serials?: string[] }> = []): { unidades: number; conImei: number; pendientes: number } {
  const unidades = lineas.reduce((suma, linea) => suma + Math.max(0, Math.round(Number(linea.quantity) || 0)), 0)
  const conImei = lineas.reduce((suma, linea) => suma + Math.min(Math.max(0, Math.round(Number(linea.quantity) || 0)), Array.isArray(linea.serials) ? linea.serials.length : 0), 0)
  return { unidades, conImei, pendientes: Math.max(0, unidades - conImei) }
}
