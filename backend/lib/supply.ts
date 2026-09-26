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
  // #250 F1: centro de compra asignado a la necesidad (CDE · USA · LOCAL…).
  centro?: string | null
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
  centro: string | null
}

export type GrupoConsolidado = {
  productoId: string
  producto: string
  condicion: string
  cantidad: number
  prioridad: NecesidadPrioridad
  prometidaEl: string | null
  origenes: string[]
  centros: string[]
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
        centros: [],
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
    const centro = necesidad.centro ? String(necesidad.centro).toUpperCase() : null
    if (centro && !grupo.centros.includes(centro)) grupo.centros.push(centro)
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
        centro,
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

// ── Fase 4 (#250 §8 y §11): lotes y tránsito ────────────────────────────────

export const METODOS_ENVIO = ['BUS', 'TRANSPORTADORA', 'AEX', 'IMPORTACION'] as const
export type MetodoEnvio = (typeof METODOS_ENVIO)[number]
export const METODO_ENVIO_LABEL: Record<MetodoEnvio, string> = {
  BUS: 'Bus',
  TRANSPORTADORA: 'Transportadora',
  AEX: 'AEX',
  IMPORTACION: 'Importación',
}

// Máquina de estados de un envío entrante. Las compras externas se registran
// como envío (nunca como traslado interno) y la recepción es de la Fase 5: acá
// el lote llega hasta EN_TRANSITO (o incidencia/cancelado).
export const ENVIO_ESTADOS = ['BORRADOR', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'RECEPCION_PARCIAL', 'RECIBIDO', 'CON_INCIDENCIA', 'CANCELADO'] as const
export type EnvioEstado = (typeof ENVIO_ESTADOS)[number]
export const TRANSICIONES_ENVIO: Record<string, string[]> = {
  BORRADOR: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['DESPACHADO', 'BORRADOR', 'CANCELADO'],
  DESPACHADO: ['EN_TRANSITO', 'CON_INCIDENCIA', 'CANCELADO'],
  EN_TRANSITO: ['RECEPCION_PARCIAL', 'RECIBIDO', 'CON_INCIDENCIA'],
  RECEPCION_PARCIAL: ['RECIBIDO', 'CON_INCIDENCIA'],
  CON_INCIDENCIA: ['EN_TRANSITO', 'RECEPCION_PARCIAL', 'RECIBIDO', 'CANCELADO'],
  RECIBIDO: [],
  CANCELADO: [],
}
/** Estados que resuelve la recepción (Fase 5), no esta fase. */
export const ENVIO_ESTADOS_RECEPCION = ['RECEPCION_PARCIAL', 'RECIBIDO']

export function transicionEnvioValida(desde: string, hacia: string): boolean {
  return (TRANSICIONES_ENVIO[desde] || []).includes(hacia)
}

/** Código compartido del envío (#250 §2): `ENV-CDE-ASU-0021`. */
export function codigoEnvio({ origen = 'CDE', destino = 'ASU', secuencia }: { origen?: string; destino?: string; secuencia: number }): string {
  const tramo = (valor: string) => String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'XXX'
  const numero = String(Math.max(1, Math.round(Number(secuencia) || 1))).padStart(4, '0')
  return `ENV-${tramo(origen)}-${tramo(destino)}-${numero}`
}

export type ItemEnvio = { lineId: string; productId: string; serial: string | null }

/**
 * Expande las líneas de una compra a unidades del lote: una fila por unidad,
 * con su IMEI si ya se conoce o `null` si queda pendiente. Respeta lo que ya
 * viaja en otros lotes (no repite seriales) y no se pasa de la cantidad
 * comprada.
 */
export function expandirItemsEnvio({ lineas, asignados = [] }: { lineas: Array<{ id: string; productId: string; quantity: number; serials?: string[] }>; asignados?: Array<{ lineId: string; serial?: string | null; cantidad?: number }> }): { ok: true; items: ItemEnvio[] } | { ok: false; error: string } {
  const yaPorLinea = new Map<string, { seriales: Set<string>; cantidad: number }>()
  for (const fila of asignados) {
    const actual = yaPorLinea.get(fila.lineId) || { seriales: new Set<string>(), cantidad: 0 }
    if (fila.serial) actual.seriales.add(String(fila.serial).toUpperCase())
    actual.cantidad += Math.max(0, Math.round(Number(fila.cantidad) || 1))
    yaPorLinea.set(fila.lineId, actual)
  }
  const items: ItemEnvio[] = []
  const serialesEnLote = new Set<string>()
  for (const linea of lineas) {
    const previo = yaPorLinea.get(linea.id) || { seriales: new Set<string>(), cantidad: 0 }
    const disponibles = linea.serials || []
    const yaCargados = previo.cantidad
    const libres = disponibles.filter((serial) => !previo.seriales.has(String(serial).toUpperCase()) && !serialesEnLote.has(String(serial).toUpperCase()))
    const cantidadLinea = Math.max(0, Math.round(Number(linea.quantity) || 0))
    const lugar = Math.max(0, cantidadLinea - yaCargados)
    if (lugar === 0) continue
    // Primero los IMEI conocidos que todavía no viajan, después las unidades pendientes.
    for (const serial of libres.slice(0, lugar)) {
      serialesEnLote.add(String(serial).toUpperCase())
      items.push({ lineId: linea.id, productId: linea.productId, serial: String(serial).toUpperCase() })
    }
    const pendientes = lugar - Math.min(lugar, libres.length)
    for (let i = 0; i < pendientes; i += 1) items.push({ lineId: linea.id, productId: linea.productId, serial: null })
  }
  if (!items.length) return { ok: false, error: 'El envío no lleva unidades: revisá lo que ya viaja en otros lotes.' }
  return { ok: true, items }
}

export type ManifiestoEnvio = {
  code: string
  origen: string
  destino: string | null
  metodo: string
  metodoLabel: string
  empresa: string | null
  conductor: string | null
  guia: string | null
  responsable: string | null
  estado: string
  salida: string | null
  eta: string | null
  llegada: string | null
  compra: string | null
  unidades: number
  conImei: number
  pendientes: number
  lineas: Array<{ producto: string; capacidad: string; condicion: string; cantidad: number; imeis: string[]; pendientes: number }>
  enlace: string | null
  notas: string | null
}

/** Manifiesto del envío (#250 §11): datos del lote + IMEI conocidos/pendientes. */
export function manifiestoEnvio({ envio, items = [], base = '' }: { envio: any; items?: any[]; base?: string }): ManifiestoEnvio {
  const porLinea = new Map<string, { producto: string; capacidad: string; condicion: string; imeis: string[]; pendientes: number }>()
  for (const item of items) {
    const clave = item.lineId
    const actual = porLinea.get(clave) || { producto: item.producto || '', capacidad: item.capacidad || '', condicion: item.condicion || 'NEW', imeis: [] as string[], pendientes: 0 }
    if (item.serial) actual.imeis.push(String(item.serial).toUpperCase())
    else actual.pendientes += 1
    porLinea.set(clave, actual)
  }
  const lineas = [...porLinea.values()].map((linea) => ({ ...linea, cantidad: linea.imeis.length + linea.pendientes }))
  const conImei = lineas.reduce((suma, linea) => suma + linea.imeis.length, 0)
  const pendientes = lineas.reduce((suma, linea) => suma + linea.pendientes, 0)
  return {
    code: envio.code,
    origen: envio.origin,
    destino: envio.destinationBranch?.name || envio.destino || null,
    metodo: envio.method,
    metodoLabel: METODO_ENVIO_LABEL[envio.method as MetodoEnvio] || envio.method,
    empresa: envio.company || null,
    conductor: envio.driver || null,
    guia: envio.guide || null,
    responsable: envio.responsible?.name || envio.responsable || null,
    estado: envio.status,
    salida: envio.sentAt || null,
    eta: envio.etaAt || null,
    llegada: envio.arrivedAt || null,
    compra: envio.purchase?.code || envio.compra || null,
    unidades: conImei + pendientes,
    conImei,
    pendientes,
    lineas,
    enlace: envio.publicToken ? `${base}/envio/${envio.publicToken}` : null,
    notas: envio.notes || null,
  }
}

// ── Fase 5 (#250 §9 y §10): recepción ───────────────────────────────────────

// Resultado por unidad recibida. `DANADO`/`INCORRECTO`/`SOBRANTE` son
// incidencias: quedan fuera del stock vendible hasta resolverse.
export const RESULTADOS_RECEPCION = ['RECIBIDO', 'FALTANTE', 'SOBRANTE', 'DANADO', 'INCORRECTO'] as const
export type ResultadoRecepcion = (typeof RESULTADOS_RECEPCION)[number]
export const RESULTADO_RECEPCION_LABEL: Record<ResultadoRecepcion, string> = {
  RECIBIDO: 'Recibido',
  FALTANTE: 'Faltante',
  SOBRANTE: 'Sobrante',
  DANADO: 'Dañado',
  INCORRECTO: 'Incorrecto',
}
/** Los que entran al stock al confirmar. */
export const RESULTADOS_A_STOCK: ResultadoRecepcion[] = ['RECIBIDO']
/** Los que se consideran incidencia (#250 §10). */
export const RESULTADOS_INCIDENCIA: ResultadoRecepcion[] = ['SOBRANTE', 'DANADO', 'INCORRECTO']

/**
 * Compara lo escaneado con lo esperado del manifiesto: los IMEI conocidos que
 * coinciden, los que completan unidades con IMEI diferido (el escaneo asigna el
 * serial a esa unidad) y los sobrantes (no estaban en el lote).
 */
export function compararEscaneo({ esperados = [], escaneados = [] }: { esperados?: Array<{ shipmentItemId: string; serial?: string | null }>; escaneados?: string[] }): { recibidos: Array<{ shipmentItemId: string | null; serial: string }>; sobrantes: string[] } {
  const pendientes = esperados.filter((item) => !item.serial)
  const recibidos: Array<{ shipmentItemId: string | null; serial: string }> = []
  const sobrantes: string[] = []
  let pendienteIndice = 0
  for (const crudo of escaneados) {
    const serial = String(crudo || '').trim().toUpperCase()
    if (!serial) continue
    const conocido = esperados.find((item) => String(item.serial || '').toUpperCase() === serial)
    if (conocido) {
      recibidos.push({ shipmentItemId: conocido.shipmentItemId, serial })
      continue
    }
    if (pendientes[pendienteIndice]) {
      recibidos.push({ shipmentItemId: pendientes[pendienteIndice].shipmentItemId, serial })
      pendienteIndice += 1
      continue
    }
    sobrantes.push(serial)
  }
  return { recibidos, sobrantes }
}

/** Estado final del lote según lo recibido (#250 §9). */
export function estadoLoteRecepcion({ unidades, recibidas, incidencias }: { unidades: number; recibidas: number; incidencias: number }): 'RECIBIDO' | 'RECEPCION_PARCIAL' | 'CON_INCIDENCIA' {
  if (incidencias > 0) return 'CON_INCIDENCIA'
  if (unidades > 0 && recibidas >= unidades) return 'RECIBIDO'
  return 'RECEPCION_PARCIAL'
}

/**
 * Costo por unidad recibida: el costo unitario de la línea si está cargado y,
 * si no, la parte proporcional del total de la compra (mismo reparto para el
 * monto original en su moneda).
 */
export function costoPorUnidad({ totalCostPyg = null, totalOriginal = null, currency = 'PYG', rate = null, unidades, unitCostPyg = null }: { totalCostPyg?: number | null; totalOriginal?: number | null; currency?: string; rate?: number | null; unidades: number; unitCostPyg?: number | null }): { costPyg: number | null; originalCost: number | null; costCurrency: string; exchangeRatePyg: number | null } {
  const cuantas = Math.max(1, Math.round(Number(unidades) || 1))
  if (unitCostPyg !== null && unitCostPyg !== undefined && Number(unitCostPyg) > 0) {
    const unitario = Math.round(Number(unitCostPyg))
    return {
      costPyg: unitario,
      originalCost: currency === 'PYG' ? unitario : (rate && Number(rate) > 0 ? Number((unitario / Number(rate)).toFixed(2)) : null),
      costCurrency: currency,
      exchangeRatePyg: currency === 'PYG' ? null : (rate ?? null),
    }
  }
  if (totalCostPyg === null || totalCostPyg === undefined || !Number.isFinite(Number(totalCostPyg))) return { costPyg: null, originalCost: null, costCurrency: currency, exchangeRatePyg: currency === 'PYG' ? null : (rate ?? null) }
  const costPyg = Math.round(Number(totalCostPyg) / cuantas)
  const originalCost = totalOriginal === null || totalOriginal === undefined ? (currency === 'PYG' ? costPyg : (rate && Number(rate) > 0 ? Number((costPyg / Number(rate)).toFixed(2)) : null)) : Number((Number(totalOriginal) / cuantas).toFixed(currency === 'PYG' ? 0 : 2))
  return { costPyg, originalCost, costCurrency: currency, exchangeRatePyg: currency === 'PYG' ? null : (rate ?? null) }
}

/** Resumen por resultado (para el panel y el comprobante de recepción). */
export function resumenRecepcion(items: Array<{ resultado: string }> = []): Record<ResultadoRecepcion, number> {
  const base = { RECIBIDO: 0, FALTANTE: 0, SOBRANTE: 0, DANADO: 0, INCORRECTO: 0 } as Record<ResultadoRecepcion, number>
  for (const item of items) {
    const clave = String(item?.resultado || '') as ResultadoRecepcion
    if (clave in base) base[clave] += 1
  }
  return base
}
