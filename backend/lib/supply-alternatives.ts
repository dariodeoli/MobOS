// A5 (#279) · Variante agotada → alternativas: reglas puras y utilidades del
// flujo (versiones, aprobación del cliente con OTP, token público del enlace y
// estado de la necesidad). Nunca se sustituye solo: toda diferencia de precio
// exige aprobación del cliente.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const ALTERNATIVA_ESTADOS = ['PROPUESTA', 'VENDEDOR_OK', 'ENVIADA_AL_CLIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA'] as const
export type AlternativaEstado = (typeof ALTERNATIVA_ESTADOS)[number]

export const OTP_VIGENCIA_MINUTOS = 30
export const OTP_MAX_INTENTOS = 5

/** ¿La opción cambia precio/condiciones y necesita aprobación del cliente? */
export const requiereAprobacionCliente = (priceDeltaPyg: unknown) => Number(priceDeltaPyg || 0) !== 0

/** Token público del enlace del cliente: 64 hex; en la base solo el sha256. */
export function generarTokenPublico() {
  return randomBytes(32).toString('hex')
}

export function hashToken(valor: string) {
  return createHash('sha256').update(String(valor || '')).digest('hex')
}

export function generarCodigoOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function huellaOtp(codigo: string) {
  return createHash('sha256').update(String(codigo || '').trim()).digest('hex')
}

export function vigenciaOtp(ahora = new Date()) {
  return new Date(ahora.getTime() + OTP_VIGENCIA_MINUTOS * 60 * 1000)
}

export function otpVigente(expiresAt: Date | null | undefined, ahora = new Date()) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() > ahora.getTime())
}

export function otpValido(codigo: string, huella: string | null | undefined, intentos = 0) {
  if (!huella || intentos >= OTP_MAX_INTENTOS) return false
  const calculado = Buffer.from(huellaOtp(codigo), 'hex')
  const guardado = Buffer.from(String(huella), 'hex')
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado)
}

/** Estado de la necesidad según cómo terminó la alternativa. */
export function estadoNecesidadTras(estado: AlternativaEstado): 'COMPRADA' | 'CANCELADA' | 'ESPERANDO_CLIENTE' | 'ABIERTA' {
  if (estado === 'ACEPTADA') return 'COMPRADA'
  if (estado === 'CANCELADA') return 'CANCELADA'
  if (estado === 'ENVIADA_AL_CLIENTE' || estado === 'PROPUESTA') return 'ESPERANDO_CLIENTE'
  return 'ABIERTA'
}

/** Resumen legible de una versión (auditoría, cronología y enlace del cliente). */
export function resumenAlternativa(alternativa: { optionSummary?: string | null; priceDeltaPyg?: number | null; newEta?: Date | string | null }) {
  const partes = [String(alternativa.optionSummary || '').trim()].filter(Boolean)
  const delta = Number(alternativa.priceDeltaPyg || 0)
  if (delta !== 0) partes.push(`${delta > 0 ? '+' : '−'}Gs ${Math.abs(delta).toLocaleString('es-PY')}`)
  if (alternativa.newEta) partes.push(`entrega ${new Date(alternativa.newEta).toLocaleDateString('es-PY')}`)
  return partes.join(' · ')
}
