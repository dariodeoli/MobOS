// Mapeo de Order / Customer / ítems a los campos fiscales del DE (#130,
// Fase 1). No toca la base ni llama a SIFEN: recibe estructuras y devuelve el
// documento tipado, con la lista de datos del negocio que todavía faltan para
// emitir de verdad.
//
// Decisiones de esta fase, documentadas en `faltantes` y en docs/SIFEN.md:
// - Los precios del negocio son finales con IVA incluido: cada ítem se mapea
//   gravado al 10% y la base se despeja del total (total / 1,1).
// - El descuento global del pedido se reparte proporcionalmente entre los
//   ítems para que la base gravada y el total cierren al guaraní.
// - El tipo de documento del cliente (RUC o CI) no está en la ficha: se infiere
//   por el formato; el DV del RUC se calcula con el módulo 11 del SIFEN.
// - El nombre del negocio, su tipo de contribuyente y su dirección vienen de
//   la configuración de entorno: `Tenant` solo guarda RUC, dirección y ciudad.

import { CONDICION_OPERACION, MEDIO_PAGO, TIPO_DOCUMENTO_RECEPTOR } from './contracts'
import { AFECTACION_IVA, DESCRIPCION_TIPO_DOCUMENTO, NATURALEZA_RECEPTOR, SIFEN_VERSION, TIPO_CONTRIBUYENTE, TIPO_DOCUMENTO, TIPO_EMISION, TIPO_OPERACION_RECEPTOR, TIPO_TRANSACCION } from './contracts'
import type { SifenDocumentoFiscal, SifenEntrega, SifenItem } from './contracts'
import { componerCdc, digitoVerificadorModulo11, dvRucValido } from './cdc'
import type { SifenConfig } from './config'

export type OrdenFiscal = {
  id: string
  orderNumber: string
  createdAt: Date | string
  subtotalPyg: number
  discountPyg: number
  deliveryPyg: number
  deliveryType?: string | null
  dueAt?: Date | string | null
  creditDays?: number | null
  totalPyg: number
  items: Array<{
    description: string
    quantity: number
    unitPricePyg: number
    totalPyg: number
    discountPyg?: number
    serials?: unknown
  }>
  payments?: Array<{ method: string; amountPyg: number; status?: string | null }>
}

export type ClienteFiscal = {
  name: string
  document?: string | null
  billingName?: string | null
  billingDocument?: string | null
  email?: string | null
  phone?: string | null
  countryCode?: string | null
}

export type DocumentoInterpretado = {
  tipo: number
  numero: string
  dv: string | null
  /** true cuando el tipo se dedujo del formato y el negocio debe confirmarlo. */
  inferido: boolean
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Math.round(Number(valor)) : 0)
const fecha = (valor: Date | string | undefined | null) => (valor instanceof Date ? valor : new Date(String(valor ?? '')))

/**
 * Interpreta el documento del cliente. Con guion se toma RUC (el DV se respeta
 * si cierra y se recalcula si no); sin guion, 8+ dígitos se toman como RUC y el
 * resto como cédula. Vacío es consumidor final innominado.
 */
export function interpretarDocumento(documento: unknown): DocumentoInterpretado {
  const texto = String(documento ?? '').trim()
  if (!texto) return { tipo: TIPO_DOCUMENTO_RECEPTOR.INNOMINADO, numero: '0', dv: null, inferido: false }
  const limpio = texto.replace(/[.\s]/g, '')
  const conGuion = /^(\d{5,12})-(\d)$/.exec(limpio)
  const soloNumeros = /^\d{5,12}$/.test(limpio)
  if (conGuion) {
    const base = conGuion[1]
    const escrito = conGuion[2]
    const dv = dvRucValido(base, escrito) ? escrito : String(digitoVerificadorModulo11(base))
    return { tipo: TIPO_DOCUMENTO_RECEPTOR.RUC, numero: base, dv, inferido: false }
  }
  if (soloNumeros && limpio.length >= 8) {
    return { tipo: TIPO_DOCUMENTO_RECEPTOR.RUC, numero: limpio, dv: String(digitoVerificadorModulo11(limpio)), inferido: true }
  }
  if (soloNumeros) return { tipo: TIPO_DOCUMENTO_RECEPTOR.CI, numero: limpio, dv: null, inferido: true }
  return { tipo: TIPO_DOCUMENTO_RECEPTOR.OTRO, numero: limpio.slice(0, 20), dv: null, inferido: true }
}

/** Tipo de contribuyente del receptor por la forma del nombre (dato faltante). */
export function tipoContribuyenteDe(razonSocial: string): number {
  return /(S\.?A\.?|S\.?R\.?L\.?|E\.?A\.?S\.?|SOCIEDAD|EMPRESA|IMPORTADORA|COMERCIAL|COOPERATIVA|FUNDACI[OÓ]N|BANCO)\b/i.test(razonSocial)
    ? TIPO_CONTRIBUYENTE.PERSONA_JURIDICA
    : TIPO_CONTRIBUYENTE.PERSONA_FISICA
}

function serialesDe(item: OrdenFiscal['items'][number]): string[] {
  return Array.isArray(item.serials) ? item.serials.map((serial) => String(serial)).filter(Boolean) : []
}

/** Base e IVA de un total con IVA incluido, cerrando al guaraní. */
function desglosarIva(totalConIva: number, tasa: number): { base: number; iva: number } {
  if (tasa <= 0) return { base: totalConIva, iva: 0 }
  const base = Math.round(totalConIva / (1 + tasa / 100))
  return { base, iva: totalConIva - base }
}

/**
 * Reparte el descuento global en proporción al peso de cada línea, ajustando
 * la última para que la suma de los netos sea exactamente total - descuento.
 */
function netosConDescuentoGlobal(brutos: number[], descuento: number): number[] {
  const total = brutos.reduce((suma, valor) => suma + valor, 0)
  if (!descuento || total <= 0) return brutos.slice()
  const factor = (total - descuento) / total
  const netos: number[] = []
  let asignado = 0
  brutos.forEach((bruto, indice) => {
    if (indice === brutos.length - 1) netos.push(total - descuento - asignado)
    else {
      const neto = Math.round(bruto * factor)
      netos.push(neto)
      asignado += neto
    }
  })
  return netos
}

const medioPagoDe = (metodo: string): number =>
  ({ CASH: MEDIO_PAGO.EFECTIVO, TRANSFER: MEDIO_PAGO.TRANSFERENCIA, CARD: MEDIO_PAGO.TARJETA_CREDITO, PIX: MEDIO_PAGO.BILLETERA_ELECTRONICA, TRADE_IN: MEDIO_PAGO.OTRO, STORE_CREDIT: MEDIO_PAGO.VALE, CREDIT: MEDIO_PAGO.OTRO } as Record<string, number>)[metodo] || MEDIO_PAGO.OTRO

export type MapeoFiscal = SifenDocumentoFiscal

export type OpcionesMapeo = {
  orden: OrdenFiscal
  cliente?: ClienteFiscal | null
  config: SifenConfig
  /** Número correlativo del DE (Fase 2 lo toma de la numeración del timbrado). */
  numeroDocumento: number
  /** Código de seguridad de 9 dígitos; si falta, el CDC queda sin componer. */
  codigoSeguridad?: string
  fechaEmision?: Date
  tipoDocumento?: number
  /** Tipo de cambio cuando la moneda no es PYG (Fase 2). */
  tipoCambio?: number | null
}

/**
 * Construye el documento fiscal del pedido. Devuelve el CDC compuesto cuando
 * hay número y código de seguridad; si no, `cdc: null` (borrador sin numerar).
 */
export function mapearDocumentoFiscal({ orden, cliente, config, numeroDocumento, codigoSeguridad, fechaEmision, tipoDocumento = TIPO_DOCUMENTO.FACTURA }: OpcionesMapeo): MapeoFiscal {
  const emision = fechaEmision instanceof Date ? fechaEmision : new Date()
  const faltantes = new Set<string>([
    'El tipo de IVA por producto no está en el catálogo: todos los ítems se mapean gravados al 10% con IVA incluido en el precio.',
    'La ficha del cliente no distingue RUC de cédula: el tipo de documento se infiere del formato.',
    'El tipo de contribuyente del emisor y su razón social vienen de la configuración de entorno (Tenant solo guarda RUC, dirección y ciudad).',
    'La unidad de medida y el código interno por ítem necesitan el SKU del producto (hoy la línea no lo guarda).',
    'La numeración del timbrado por establecimiento y punto de expedición es Fase 2.',
  ])

  // ── Receptor ──────────────────────────────────────────────────────────
  const razonSocial = String(cliente?.billingName || cliente?.name || 'Sin Nombre').trim() || 'Sin Nombre'
  const documento = interpretarDocumento(cliente?.billingDocument || cliente?.document)
  if (documento.inferido) faltantes.add('Confirmar en la ficha del cliente si el documento es RUC o cédula (se infirió por el formato).')
  const contribuyente = documento.tipo === TIPO_DOCUMENTO_RECEPTOR.RUC
  if (!cliente) faltantes.add('El pedido no tiene cliente: se emite a consumidor final innominado.')
  else if (!contribuyente) faltantes.add('El cliente no tiene RUC: el DE va como no contribuyente (B2C) y sin crédito fiscal para él.')

  // ── Ítems y descuento global ──────────────────────────────────────────
  const brutos = orden.items.map((item) => numero(item.totalPyg))
  if (orden.deliveryPyg > 0) brutos.push(numero(orden.deliveryPyg))
  const descuentoGlobal = Math.max(0, numero(orden.discountPyg))
  const netos = netosConDescuentoGlobal(brutos, descuentoGlobal)
  const items: SifenItem[] = []
  let baseGravada10 = 0
  let totalIva = 0
  orden.items.forEach((item, indice) => {
    const neto = netos[indice]
    const { base, iva } = desglosarIva(neto, 10)
    baseGravada10 += base
    totalIva += iva
    items.push({
      codigo: null,
      descripcion: String(item.description || 'Ítem').slice(0, 200),
      cantidad: Math.max(1, numero(item.quantity)),
      precioUnitario: numero(item.unitPricePyg),
      descuento: Math.max(0, numero(item.discountPyg)),
      total: neto,
      afectacionIva: AFECTACION_IVA.GRAVADO,
      tasaIva: 10,
      baseGravada: base,
      liquidacionIva: iva,
      seriales: serialesDe(item),
    })
  })
  if (orden.deliveryPyg > 0) {
    const neto = netos[netos.length - 1]
    const { base, iva } = desglosarIva(neto, 10)
    baseGravada10 += base
    totalIva += iva
    items.push({
      codigo: null,
      descripcion: `Envío (${String(orden.deliveryType || 'delivery')})`.slice(0, 200),
      cantidad: 1,
      precioUnitario: numero(orden.deliveryPyg),
      descuento: 0,
      total: neto,
      afectacionIva: AFECTACION_IVA.GRAVADO,
      tasaIva: 10,
      baseGravada: base,
      liquidacionIva: iva,
      seriales: [],
    })
  }

  // ── Condición y entregas ──────────────────────────────────────────────
  const credito = Boolean(orden.dueAt) || numero(orden.creditDays) > 0
  const pagos = (orden.payments || []).filter((pago) => !pago.status || pago.status === 'CONFIRMED')
  const entregas: SifenEntrega[] = credito
    ? []
    : pagos.map((pago) => ({ tipo: medioPagoDe(String(pago.method)), monto: numero(pago.amountPyg), moneda: 'PYG' }))
  if (credito && (!orden.creditDays || !orden.dueAt)) faltantes.add('Venta a crédito sin plazo o vencimiento completos: SIFEN pide el detalle de la condición.')
  if (!credito && pagos.some((pago) => pago.method === 'CARD')) faltantes.add('Los pagos con tarjeta no distinguen crédito de débito (códigos 3 y 4 de SIFEN).')
  if (!credito && !pagos.length) faltantes.add('Venta de contado sin pagos confirmados: la entrega de la condición queda vacía.')
  const plazoDias = numero(orden.creditDays) || (credito && orden.dueAt ? Math.max(0, Math.round((fecha(orden.dueAt).getTime() - fecha(orden.createdAt).getTime()) / 86_400_000)) : 0)

  // ── Totales ───────────────────────────────────────────────────────────
  const totalOperacion = brutos.reduce((suma, valor) => suma + valor, 0)
  const totalGeneral = totalOperacion - descuentoGlobal

  // ── CDC ───────────────────────────────────────────────────────────────
  let cdc: string | null = null
  if (codigoSeguridad) {
    cdc = componerCdc({
      tipoDocumento,
      rucEmisor: config.ruc,
      dvRucEmisor: config.dv,
      establecimiento: config.establecimiento,
      puntoExpedicion: config.puntoExpedicion,
      numeroDocumento,
      tipoContribuyente: config.tipoContribuyente ?? TIPO_CONTRIBUYENTE.PERSONA_JURIDICA,
      fechaEmision: emision,
      tipoEmision: TIPO_EMISION.NORMAL,
      codigoSeguridad,
    })
  }

  return {
    version: SIFEN_VERSION,
    ambiente: config.ambiente,
    tipoDocumento,
    descripcionTipoDocumento: DESCRIPCION_TIPO_DOCUMENTO[tipoDocumento] || 'Documento electrónico',
    tipoEmision: TIPO_EMISION.NORMAL,
    tipoTransaccion: TIPO_TRANSACCION.VENTA_MERCADERIA,
    moneda: 'PYG',
    fechaEmision: emision.toISOString(),
    cdc,
    emisor: {
      ruc: config.ruc,
      dv: config.dv,
      razonSocial: config.razonSocial,
      nombreFantasia: null,
      tipoContribuyente: config.tipoContribuyente ?? TIPO_CONTRIBUYENTE.PERSONA_JURIDICA,
      direccion: config.direccion || null,
      ciudad: config.ciudad || null,
      departamento: config.departamento || null,
      telefono: config.telefono || null,
      email: config.email || null,
    },
    timbrado: {
      numero: config.timbrado,
      establecimiento: config.establecimiento,
      puntoExpedicion: config.puntoExpedicion,
    },
    receptor: {
      naturaleza: contribuyente ? NATURALEZA_RECEPTOR.CONTRIBUYENTE : NATURALEZA_RECEPTOR.NO_CONTRIBUYENTE,
      tipoOperacion: contribuyente ? TIPO_OPERACION_RECEPTOR.B2B : TIPO_OPERACION_RECEPTOR.B2C,
      tipoDocumento: documento.tipo,
      documento: documento.numero,
      dv: documento.dv,
      razonSocial,
      tipoContribuyente: contribuyente ? tipoContribuyenteDe(razonSocial) : null,
      email: cliente?.email || null,
      telefono: cliente?.phone ? `${cliente.countryCode || '+595'} ${cliente.phone}`.trim() : null,
    },
    condicion: { tipo: credito ? CONDICION_OPERACION.CREDITO : CONDICION_OPERACION.CONTADO, plazoDias: credito ? plazoDias : null, entregas },
    items,
    totales: {
      totalOperacion,
      descuentoGlobal,
      totalGeneral,
      baseGravada5: 0,
      baseGravada10,
      totalIva,
      totalGs: totalGeneral,
    },
    faltantes: [...faltantes],
  }
}
