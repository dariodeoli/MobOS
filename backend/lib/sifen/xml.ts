// Serialización del DE a XML (#130, Fase 1). Genera el esqueleto del
// `rDE` v150 con los grupos del Manual Técnico (operación, timbrado, datos
// generales, emisor, receptor, condición, ítems y totales). No firma: la firma
// XMLDSig RSA-SHA256 y la validación contra `DE_v150.xsd` son Fase 2.
//
// Las fechas se escriben con la hora local del servidor (misma referencia que
// usa el CDC); la zona horaria de Paraguay queda como punto a fijar en Fase 2.

import type { SifenDocumentoFiscal, SifenItem } from './contracts'
import { CONDICION_OPERACION, DESCRIPCION_TIPO_DOCUMENTO, MEDIO_PAGO } from './contracts'

export function escaparXml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const fechaHora = (iso: string) => {
  const fecha = new Date(iso)
  const dos = (valor: number) => String(valor).padStart(2, '0')
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`
}

const campo = (etiqueta: string, valor: unknown, nivel: number) =>
  `\n${'  '.repeat(nivel)}<${etiqueta}>${escaparXml(valor)}</${etiqueta}>`

const etiqueta = (nombre: string, contenido: string, nivel: number) =>
  `\n${'  '.repeat(nivel)}<${nombre}>${contenido}\n${'  '.repeat(nivel)}</${nombre}>`

const descripcionMedio = (tipo: number) =>
  Object.entries(MEDIO_PAGO).find(([, codigo]) => codigo === tipo)?.[0]?.replace(/_/g, ' ').toLowerCase() || 'otro'

function itemXml(item: SifenItem, nivel: number): string {
  const valor = [
    campo('dCodInt', item.codigo || 'S/C', nivel + 1),
    campo('dDesProSer', item.descripcion, nivel + 1),
    campo('dCantProSer', item.cantidad, nivel + 1),
    etiqueta('gValorItem', [
      campo('dPUniProSer', item.precioUnitario, nivel + 2),
      campo('dTotBruOpeItem', item.total + item.descuento, nivel + 2),
      etiqueta('gValorRestaItem', [
        campo('dDescItem', item.descuento, nivel + 3),
        campo('dTotOpeItem', item.total, nivel + 3),
      ].join(''), nivel + 2),
    ].join(''), nivel + 1),
    etiqueta('gCamIVA', [
      campo('iAfecIVA', item.afectacionIva, nivel + 2),
      campo('dPropIVA', 100, nivel + 2),
      campo('dTasaIVA', item.tasaIva, nivel + 2),
      campo('dBasGravIVA', item.baseGravada, nivel + 2),
      campo('dLiqIVAItem', item.liquidacionIva, nivel + 2),
    ].join(''), nivel + 1),
  ].join('')
  return etiqueta('gCamItem', valor, nivel)
}

/**
 * XML del documento, listo para firmar en Fase 2. El `Id` del `DE` es el CDC
 * cuando existe; los borradores sin numeración salen sin ese atributo.
 */
export function generarXmlDe(documento: SifenDocumentoFiscal): string {
  const esContado = documento.condicion.tipo === CONDICION_OPERACION.CONTADO
  const pagos = documento.condicion.entregas
    .map((entrega) => etiqueta('gPagCont', [
      campo('iTiPago', entrega.tipo, 3),
      campo('dDesTiPag', descripcionMedio(entrega.tipo), 3),
      campo('dMonTiPag', entrega.monto, 3),
      campo('cMoneTiPag', entrega.moneda, 3),
      campo('dTiCamTiPag', 1, 3),
    ].join(''), 2))
    .join('')
  const credito = documento.condicion.plazoDias
    ? etiqueta('gPagCre', [
      campo('dPlazoCre', `${documento.condicion.plazoDias} días`, 3),
    ].join(''), 2)
    : ''

  const grupos = [
    etiqueta('gOpeDE', [
      campo('iTipEmi', documento.tipoEmision, 2),
      campo('dDesTipEmi', documento.tipoEmision === 1 ? 'Normal' : 'Contingencia', 2),
      documento.cdc ? campo('dCodSeg', documento.cdc.slice(34, 43), 2) : '',
    ].join(''), 1),
    etiqueta('gTimb', [
      campo('iTiDE', documento.tipoDocumento, 2),
      campo('dDesTiDE', DESCRIPCION_TIPO_DOCUMENTO[documento.tipoDocumento] || 'Documento electrónico', 2),
      campo('dNumTim', documento.timbrado.numero, 2),
      campo('dEst', documento.timbrado.establecimiento, 2),
      campo('dPunExp', documento.timbrado.puntoExpedicion, 2),
      campo('iTipCont', documento.emisor.tipoContribuyente, 2),
    ].join(''), 1),
    etiqueta('gDatGralOpe', [
      campo('dFeEmiDE', fechaHora(documento.fechaEmision), 2),
      etiqueta('gOpeCom', [
        campo('iTipTra', documento.tipoTransaccion, 3),
        campo('iTImp', 1, 3),
        campo('cMoneOpe', documento.moneda, 3),
        campo('dCondTiOp', documento.condicion.tipo, 3),
      ].join(''), 2),
      etiqueta('gEmis', [
        campo('dRucEm', documento.emisor.ruc, 3),
        campo('dDVEmi', documento.emisor.dv, 3),
        campo('iTipCont', documento.emisor.tipoContribuyente, 3),
        campo('dNomEmi', documento.emisor.razonSocial, 3),
        etiqueta('gDirEmi', [
          campo('dDirEmi', documento.emisor.direccion || '', 4),
          campo('dDesCiuEmi', documento.emisor.ciudad || '', 4),
          campo('dDesDepEmi', documento.emisor.departamento || '', 4),
          campo('dTelEmi', documento.emisor.telefono || '', 4),
          campo('dEmailE', documento.emisor.email || '', 4),
        ].join(''), 3),
      ].join(''), 2),
      etiqueta('gDatRec', [
        campo('iNatRec', documento.receptor.naturaleza, 3),
        campo('iTiOpe', documento.receptor.tipoOperacion, 3),
        campo('iTipIDRec', documento.receptor.tipoDocumento, 3),
        campo('dNumIDRec', documento.receptor.documento, 3),
        documento.receptor.dv ? campo('dDVRec', documento.receptor.dv, 3) : '',
        campo('dNomRec', documento.receptor.razonSocial, 3),
        documento.receptor.tipoContribuyente ? campo('iTipContrib', documento.receptor.tipoContribuyente, 3) : '',
        documento.receptor.email ? campo('dEmailRec', documento.receptor.email, 3) : '',
        documento.receptor.telefono ? campo('dTelRec', documento.receptor.telefono, 3) : '',
      ].join(''), 2),
    ].join(''), 1),
    etiqueta('gDtipDE', [
      etiqueta('gCamFE', '', 2),
      etiqueta('gCamCond', [campo('iCondOpe', documento.condicion.tipo, 3), esContado ? pagos : credito].join(''), 2),
      documento.items.map((item) => itemXml(item, 2)).join(''),
    ].join(''), 1),
    etiqueta('gTotSub', [
      campo('dSub10', documento.totales.baseGravada10, 2),
      campo('dTotGralOpe', documento.totales.totalGeneral, 2),
      campo('dTotDesc', documento.totales.descuentoGlobal, 2),
      campo('dTotIVA', documento.totales.totalIva, 2),
      campo('dBaseGrav10', documento.totales.baseGravada10, 2),
      campo('dTBasGraIVA', documento.totales.baseGravada10, 2),
      campo('dTotalGs', documento.totales.totalGs, 2),
    ].join(''), 1),
  ].join('')

  const atributo = documento.cdc ? ` Id="${documento.cdc}"` : ''
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ekuatia.set.gov.py/sifen/xsd siRecepDE_v150.xsd">`,
    campo('dVerFor', documento.version, 1),
    `<DE${atributo}>`,
    documento.cdc ? campo('dDVId', documento.cdc.slice(43), 2) : '',
    documento.cdc ? campo('dFecFirma', fechaHora(documento.fechaEmision), 2) : '',
    grupos,
    '\n  </DE>',
    '\n</rDE>',
    '',
  ].join('')
}
