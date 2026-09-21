// CDC (Código de Control) del DE: 44 dígitos que identifican unívocamente cada
// documento electrónico. Estructura del Manual Técnico SIFEN v150 §10.1:
//
//   01-02 iTiDE            tipo de documento (01 FE, 04 AFE, 05 NCE, 06 NDE, 07 NRE)
//   03-10 dRucEm           RUC del emisor sin dígito verificador (8, con ceros a la izquierda)
//   11    dDVEmi           dígito verificador del RUC del emisor
//   12-14 dEst             establecimiento (001-999)
//   15-17 dPunExp          punto de expedición (001-999)
//   18-24 dNumDoc          número del documento (0000001-9999999)
//   25    iTipCont         tipo de contribuyente del emisor (1 física, 2 jurídica)
//   26-33 dFeEmiDE         fecha de emisión AAAAMMDD
//   34    iTipEmi          tipo de emisión (1 normal, 2 contingencia)
//   35-43 dCodSeg          código de seguridad aleatorio de 9 dígitos (§10.3)
//   44    dDVId            dígito verificador del CDC (módulo 11 sobre los 43 previos)
//
// El ejemplo oficial del manual (§10.1) está en los tests: con RUC 44444401-7,
// establecimiento 001, punto 001, número 14528, persona jurídica, 20170125,
// emisión normal y código 587326098 el CDC es
// 01444444017001001001452822017012515873260988.

import { randomInt } from 'node:crypto'
import { SIFEN_VERSION, TIPO_DOCUMENTO, TIPO_EMISION } from './contracts'

export class SifenError extends Error {
  constructor(public readonly codigo: string, message: string) { super(message) }
}

const soloDigitos = (valor: unknown) => String(valor ?? '').replace(/\D/g, '')

/**
 * Dígito verificador módulo 11 del SIFEN: pesos cíclicos 2..11 aplicados de
 * derecha a izquierda; resto 0 o 1 devuelve 0, el resto se resta de 11.
 * Es el mismo cálculo que usa el dígito verificador del RUC paraguayo.
 */
export function digitoVerificadorModulo11(digitos: string): number {
  const cuerpo = soloDigitos(digitos)
  if (!cuerpo) throw new SifenError('dv_invalido', 'No hay dígitos para calcular el verificador.')
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const peso = 2 + ((cuerpo.length - 1 - i) % 10)
    suma += Number(cuerpo[i]) * peso
  }
  const resto = suma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** Separa un RUC "80012345-6" (o solo la base) en base y dígito verificador. */
export function separarRuc(valor: unknown): { ruc: string; dv: string } {
  const texto = String(valor ?? '').trim()
  const [base = '', dv = ''] = texto.replace(/[.\s]/g, '').split('-')
  const ruc = soloDigitos(base)
  if (!/^\d{5,12}$/.test(ruc) || (dv !== '' && !/^\d$/.test(dv))) {
    throw new SifenError('ruc_invalido', `RUC inválido: ${texto || '(vacío)'}.`)
  }
  return { ruc, dv: dv === '' ? String(digitoVerificadorModulo11(ruc)) : dv }
}

/** true si el dígito verificador corresponde a la base del RUC. */
export function dvRucValido(ruc: unknown, dv: unknown): boolean {
  const base = soloDigitos(ruc)
  const verificador = soloDigitos(dv)
  if (!/^\d{5,12}$/.test(base) || !/^\d$/.test(verificador)) return false
  return digitoVerificadorModulo11(base) === Number(verificador)
}

const rellenar = (valor: unknown, largo: number, nombre: string) => {
  const digitos = soloDigitos(valor)
  if (!digitos || digitos.length > largo) throw new SifenError('campo_invalido', `${nombre} debe tener hasta ${largo} dígitos.`)
  return digitos.padStart(largo, '0')
}

export type CdcCampos = {
  tipoDocumento: number
  rucEmisor: string
  dvRucEmisor: string
  establecimiento: string
  puntoExpedicion: string
  numeroDocumento: number
  tipoContribuyente: number
  fechaEmision: Date
  tipoEmision?: number
  codigoSeguridad: string
}

/**
 * Código de seguridad (§10.3): aleatorio de 9 dígitos, entre 000000001 y
 * 999999999, distinto del número de documento y distinto en cada operación.
 */
export function generarCodigoSeguridad(numeroDocumento?: number): string {
  const numero = Number.isSafeInteger(numeroDocumento) ? String(numeroDocumento) : ''
  for (;;) {
    const codigo = String(randomInt(1, 1_000_000_000)).padStart(9, '0')
    if (codigo !== numero.padStart(9, '0')) return codigo
  }
}

const fechaCdc = (fecha: Date) =>
  `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`

/** Compone el CDC de 44 dígitos a partir de los campos del documento. */
export function componerCdc(campos: CdcCampos): string {
  const tipoDocumento = Number(campos.tipoDocumento)
  if (!Object.values(TIPO_DOCUMENTO).includes(tipoDocumento as (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO])) {
    throw new SifenError('tipo_documento_invalido', `Tipo de documento electrónico inválido: ${campos.tipoDocumento}.`)
  }
  if (!(campos.fechaEmision instanceof Date) || Number.isNaN(campos.fechaEmision.getTime())) {
    throw new SifenError('fecha_invalida', 'La fecha de emisión del DE no es válida.')
  }
  const tipoEmision = Number(campos.tipoEmision ?? TIPO_EMISION.NORMAL)
  if (![TIPO_EMISION.NORMAL, TIPO_EMISION.CONTINGENCIA].includes(tipoEmision as 1 | 2)) {
    throw new SifenError('tipo_emision_invalido', `Tipo de emisión inválido: ${campos.tipoEmision}.`)
  }
  const ruc = rellenar(campos.rucEmisor, 8, 'El RUC del emisor')
  const dv = soloDigitos(campos.dvRucEmisor)
  if (dv.length !== 1 || !dvRucValido(ruc, dv)) {
    throw new SifenError('dv_ruc_invalido', `El dígito verificador ${dv || '(vacío)'} no corresponde al RUC ${ruc}.`)
  }
  const numero = Number(campos.numeroDocumento)
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 9_999_999) {
    throw new SifenError('numero_invalido', `El número de documento debe estar entre 1 y 9999999: ${campos.numeroDocumento}.`)
  }
  const codigo = soloDigitos(campos.codigoSeguridad)
  if (!/^\d{9}$/.test(codigo) || codigo === '000000000' || codigo === String(numero).padStart(9, '0')) {
    throw new SifenError('codigo_seguridad_invalido', 'El código de seguridad debe ser de 9 dígitos, distinto de cero y del número de documento.')
  }
  const tipoContribuyente = Number(campos.tipoContribuyente)
  if (![1, 2].includes(tipoContribuyente)) {
    throw new SifenError('tipo_contribuyente_invalido', `Tipo de contribuyente inválido: ${campos.tipoContribuyente}.`)
  }
  const cuerpo = [
    String(tipoDocumento).padStart(2, '0'),
    ruc,
    dv,
    rellenar(campos.establecimiento, 3, 'El establecimiento'),
    rellenar(campos.puntoExpedicion, 3, 'El punto de expedición'),
    rellenar(numero, 7, 'El número de documento'),
    String(tipoContribuyente),
    fechaCdc(campos.fechaEmision),
    String(tipoEmision),
    codigo,
  ].join('')
  return `${cuerpo}${digitoVerificadorModulo11(cuerpo)}`
}

/** true si el CDC es de 44 dígitos y su verificador cierra. */
export function cdcValido(cdc: unknown): boolean {
  const texto = soloDigitos(cdc)
  if (!/^\d{44}$/.test(texto)) return false
  return digitoVerificadorModulo11(texto.slice(0, 43)) === Number(texto[43])
}

/** El CDC en grupos de cuatro, como se imprime en el KuDE. */
export function formatearCdc(cdc: string): string {
  const texto = soloDigitos(cdc)
  if (!/^\d{44}$/.test(texto)) throw new SifenError('cdc_invalido', 'El CDC debe tener 44 dígitos.')
  return texto.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export const VERSION_FORMATO = SIFEN_VERSION
