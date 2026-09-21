// Capa de servicio de SIFEN (#130, Fase 1): decide si la emisión fiscal está
// encendida, arma el borrador del DE con el pedido real y lo persiste en
// SifenDocument. Sin certificado configurado devuelve NO_FISCAL y no toca
// nada: el comprobante sigue siendo el documento no fiscal de siempre.
//
// La numeración del timbrado y el envío real son Fase 2; acá el número llega
// del llamador para que el borrador y el CDC sean verificables.

import { prisma } from '../prisma'
import { cdcValido, generarCodigoSeguridad, SifenError } from './cdc'
import { sifenConfig, sifenMotivoApagado } from './config'
import type { SifenAmbiente } from './contracts'
import { mapearDocumentoFiscal } from './mapping'
import type { MapeoFiscal } from './mapping'
import { generarXmlDe } from './xml'

export type EstadoSifen = {
  habilitado: boolean
  motivo: string | null
  ambiente: SifenAmbiente
}

/** Estado del módulo para diagnóstico (sin exponer credenciales). */
export function estadoSifen(): EstadoSifen {
  const config = sifenConfig()
  return {
    habilitado: config !== null,
    motivo: sifenMotivoApagado(),
    ambiente: config?.ambiente || (String(process.env.MOBOS_SIFEN_AMBIENTE || '').toLowerCase() === 'prod' ? 'prod' : 'test'),
  }
}

export type BorradorFiscal = {
  estado: 'BORRADOR'
  documento: MapeoFiscal
  xml: string
}

export type ResultadoNoFiscal = {
  estado: 'NO_FISCAL'
  motivo: string
}

export type OpcionesBorrador = {
  numeroDocumento: number
  codigoSeguridad?: string
  fechaEmision?: Date
}

/**
 * Arma el DE de un pedido (sin persistir). Devuelve NO_FISCAL cuando el módulo
 * está apagado. Lanza SifenError si el pedido no existe.
 */
export async function prepararBorrador(orderId: string, opciones: OpcionesBorrador): Promise<BorradorFiscal | ResultadoNoFiscal> {
  const config = sifenConfig()
  if (!config) return { estado: 'NO_FISCAL', motivo: sifenMotivoApagado() || 'SIFEN no está configurado.' }
  if (!opciones || !Number.isSafeInteger(opciones.numeroDocumento)) throw new SifenError('numero_invalido', 'Falta el número de documento del DE.')

  const orden = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: true, payments: true },
  })
  if (!orden) throw new SifenError('pedido_inexistente', `No existe el pedido ${orderId}.`)

  const documento = mapearDocumentoFiscal({
    orden,
    cliente: orden.customer,
    config,
    numeroDocumento: opciones.numeroDocumento,
    codigoSeguridad: opciones.codigoSeguridad || generarCodigoSeguridad(opciones.numeroDocumento),
    fechaEmision: opciones.fechaEmision || new Date(),
  })
  if (!documento.cdc || !cdcValido(documento.cdc)) throw new SifenError('cdc_invalido', 'No se pudo componer un CDC válido para el borrador.')
  return { estado: 'BORRADOR', documento, xml: generarXmlDe(documento) }
}

/**
 * Persiste el borrador (DRAFT) del pedido. Idempotente por pedido + ambiente:
 * reintentos reutilizan la misma fila y actualizan XML/CDC.
 */
export async function guardarBorrador(orderId: string, borrador: BorradorFiscal): Promise<{ id: string; status: string; cdc: string | null }> {
  const config = sifenConfig()
  if (!config) throw new SifenError('sifen_no_configurado', 'SIFEN no está configurado.')
  if (!borrador.documento.cdc) throw new SifenError('cdc_invalido', 'El borrador no tiene CDC: falta el número o el código de seguridad.')
  const tenantId = (await prisma.order.findUnique({ where: { id: orderId }, select: { tenantId: true } }))?.tenantId
  if (!tenantId) throw new SifenError('pedido_inexistente', `No existe el pedido ${orderId}.`)
  const datos = {
    tenantId,
    orderId,
    status: 'DRAFT' as const,
    ambiente: config.ambiente,
    tipoDocumento: borrador.documento.tipoDocumento,
    establecimiento: config.establecimiento,
    puntoExpedicion: config.puntoExpedicion,
    numero: Number(borrador.documento.cdc.slice(17, 24)),
    timbrado: config.timbrado,
    cdc: borrador.documento.cdc,
    xml: borrador.xml,
    error: null,
  }
  const guardado = await prisma.sifenDocument.upsert({
    where: { orderId_ambiente: { orderId, ambiente: config.ambiente } },
    create: datos,
    update: { ...datos, status: 'DRAFT', respuesta: undefined, enviadoAt: null, resueltoAt: null },
  })
  return { id: guardado.id, status: guardado.status, cdc: guardado.cdc }
}
