// Contratos tipados del Documento Electrónico de SIFEN (#130, Fase 1).
// Solo tipos y tablas de códigos del Manual Técnico v150: ningún valor real,
// ninguna credencial y ninguna llamada de red.

export type SifenAmbiente = 'test' | 'prod'

// Versión del formato de los Web Services y schemas (Manual Técnico v150).
export const SIFEN_VERSION = '150'

// Tipo de documento electrónico (iTiDE).
export const TIPO_DOCUMENTO = {
  FACTURA: 1,
  AUTOFACTURA: 4,
  NOTA_CREDITO: 5,
  NOTA_DEBITO: 6,
  NOTA_REMISION: 7,
} as const

export const DESCRIPCION_TIPO_DOCUMENTO: Record<number, string> = {
  1: 'Factura electrónica',
  4: 'Autofactura electrónica',
  5: 'Nota de crédito electrónica',
  6: 'Nota de débito electrónica',
  7: 'Nota de remisión electrónica',
}

// Tipo de emisión (iTipEmi).
export const TIPO_EMISION = { NORMAL: 1, CONTINGENCIA: 2 } as const

// Tipo de contribuyente (iTipCont).
export const TIPO_CONTRIBUYENTE = { PERSONA_FISICA: 1, PERSONA_JURIDICA: 2 } as const

// Tipo de transacción (iTipTra).
export const TIPO_TRANSACCION = {
  VENTA_MERCADERIA: 1,
  PRESTACION_SERVICIOS: 2,
  VENTA_ACTIVO_FIJO: 4,
  OTRO: 99,
} as const

// Tipo de impuesto (iTImp).
export const TIPO_IMPUESTO = { IVA: 1, ISC: 2, RENTA: 3, NINGUNO: 4 } as const

// Naturaleza del receptor (iNatRec).
export const NATURALEZA_RECEPTOR = { CONTRIBUYENTE: 1, NO_CONTRIBUYENTE: 2 } as const

// Tipo de operación del receptor (iTiOpe).
export const TIPO_OPERACION_RECEPTOR = { B2B: 1, B2C: 2, B2G: 3, B2F: 4 } as const

// Tipo de documento de identidad del receptor (iTipIDRec).
export const TIPO_DOCUMENTO_RECEPTOR = {
  RUC: 1,
  CI: 2,
  PASAPORTE: 3,
  CI_EXTRANJERA: 4,
  INNOMINADO: 5,
  CARNET_RESIDENCIA: 6,
  OTRO: 9,
} as const

// Condición de la operación (iCondOpe / dCondTiOp).
export const CONDICION_OPERACION = { CONTADO: 1, CREDITO: 2 } as const

// Medios de pago (iMPago). El Manual deja la tarjeta en crédito/débito: la
// ficha de la cuenta no distingue, así que se documenta como dato faltante.
export const MEDIO_PAGO = {
  EFECTIVO: 1,
  CHEQUE: 2,
  TARJETA_CREDITO: 3,
  TARJETA_DEBITO: 4,
  TRANSFERENCIA: 5,
  GIRO: 6,
  BILLETERA_ELECTRONICA: 7,
  TARJETA_EMPRESARIAL: 8,
  VALE: 9,
  OTRO: 10,
} as const

// Afectación al IVA (iAfecIVA).
export const AFECTACION_IVA = { GRAVADO: 1, EXONERADO: 2, EXENTO: 3, GRAVADO_PARCIAL: 4 } as const

// Tasas de IVA vigentes en Paraguay (dTasaIVA).
export const TASAS_IVA = [10, 5, 0] as const

export type SifenItem = {
  /** Código interno del ítem (SKU) cuando exista. */
  codigo: string | null
  descripcion: string
  cantidad: number
  /** Precio unitario con IVA incluido, en la moneda del documento. */
  precioUnitario: number
  descuento: number
  /** Total neto de la línea (con IVA incluido y descuentos aplicados). */
  total: number
  afectacionIva: number
  tasaIva: number
  /** Base imponible y liquidación de IVA de la línea. */
  baseGravada: number
  liquidacionIva: number
  /** Seriales/IMEI vendidos, como referencia interna (no es campo fiscal). */
  seriales: string[]
}

export type SifenEntrega = {
  tipo: number
  monto: number
  moneda: string
}

export type SifenDocumentoFiscal = {
  version: string
  ambiente: SifenAmbiente
  tipoDocumento: number
  descripcionTipoDocumento: string
  tipoEmision: number
  tipoTransaccion: number
  moneda: string
  fechaEmision: string
  /** CDC de 44 dígitos cuando se compuso; null si todavía no hay numeración. */
  cdc: string | null
  emisor: {
    ruc: string
    dv: string
    razonSocial: string
    nombreFantasia: string | null
    tipoContribuyente: number
    direccion: string | null
    ciudad: string | null
    departamento: string | null
    telefono: string | null
    email: string | null
  }
  timbrado: {
    numero: string
    establecimiento: string
    puntoExpedicion: string
  }
  receptor: {
    naturaleza: number
    tipoOperacion: number
    tipoDocumento: number
    documento: string
    dv: string | null
    razonSocial: string
    tipoContribuyente: number | null
    email: string | null
    telefono: string | null
  }
  condicion: {
    tipo: number
    plazoDias: number | null
    entregas: SifenEntrega[]
  }
  items: SifenItem[]
  totales: {
    /** Suma bruta de la operación (antes del descuento global), con IVA. */
    totalOperacion: number
    descuentoGlobal: number
    /** Total final del documento (lo que paga el cliente). */
    totalGeneral: number
    baseGravada5: number
    baseGravada10: number
    totalIva: number
    /** Guaraníes: SIFEN exige el total en Gs. aunque la moneda sea otra. */
    totalGs: number
  }
  /** Datos del negocio que faltan para emitir de verdad (Fase 2). */
  faltantes: string[]
}
