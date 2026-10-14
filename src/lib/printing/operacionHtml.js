// Cuerpo HTML de los papeles por operación (#426). Puro (sin DOM ni alias): el
// encabezado, los estilos y el envoltorio los pone `OperacionReceipt.jsx` con
// el sistema compartido de la venta (#402/#407). Mismo diseño que el
// comprobante de compra: bloques CLIENTE / PEDIDO, detalle con «1 × Gs X … Gs
// Y», filas de totales y el total como línea gruesa (sin cajas). Solo cambian
// el tipo de documento y el cuerpo.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'
import { datosEncabezado } from './empresaImpresion.js'
import { clienteHtml, pedidoHtml, pieDocumentoHtml } from './bloquesDocumento.js'

const esc = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
const signo = (monto) => (Number(monto) < 0 ? `− ${gs(Math.abs(monto))}` : gs(monto))

const fila = (rotulo, valor, clase = '') => `<tr${clase ? ` class="${clase}"` : ''}><td>${esc(rotulo)}</td><td class="num">${esc(valor)}</td></tr>`
const tarjeta = (rotulo, contenido) => `<div class="card"><div class="label">${esc(rotulo)}</div><div>${contenido}</div></div>`

const clienteCard = (doc) => clienteHtml(doc.clienteDatos || doc.cliente)
const pedidoCard = (doc, lineas = []) => pedidoHtml(doc.orden || {}, lineas)
const bloquesCliente = (doc, lineas = []) => `${clienteCard(doc)}${pedidoCard(doc, lineas)}`
const piePapel = (doc, { qrSrc = '', termico = false } = {}) => pieDocumentoHtml({ condiciones: doc.politica, qrSrc, enlace: doc.enlace, termico })

function tablaItems(items, termico) {
  const filas = items.map((item) => {
    const detalle = `<strong>${esc(item.description)}</strong>${(item.seriales || []).map((serie) => `<span class="imei">IMEI/Serie ${esc(serie)}</span>`).join('')}`
    return termico
      ? `<tr class="it"><td colspan="2">${detalle}</td></tr><tr><td class="muted">${esc(String(item.quantity))} × ${esc(gs(Math.abs(item.unitPricePyg)))}</td><td class="num">${esc(signo(item.totalPyg))}</td></tr>`
      : `<tr><td>${detalle}</td><td class="cant">${esc(String(item.quantity))}</td><td class="num">${esc(gs(Math.abs(item.unitPricePyg)))}</td><td class="num"><strong>${esc(signo(item.totalPyg))}</strong></td></tr>`
  }).join('')
  const columnas = termico ? '' : '<thead><tr><th>Producto</th><th class="cant">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead>'
  return `<table>${columnas}<tbody>${filas || `<tr><td colspan="${termico ? 2 : 4}" class="muted">Sin artículos.</td></tr>`}</tbody></table>`
}

const cantidadItems = (items) => items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)

export function cuerpoDevolucionHtml(doc, { termico = false, qrSrc = '' } = {}) {
  return `
    <div class="cols">${bloquesCliente(doc, [doc.motivo ? `Motivo: ${doc.motivo}` : ''])}</div>
    ${tablaItems(doc.items, termico)}
    <table class="totals venta">
      ${fila('Cantidad de ítems', String(cantidadItems(doc.items)))}
      ${fila('Total reembolsado', signo(doc.totalReembolsoPyg), 'total')}
    </table>
    <div class="card"><div class="label">Reembolso</div><table class="pagos">${doc.metodos.map((metodo) => fila(metodo.label, signo(metodo.amountPyg))).join('')}</table></div>
    ${piePapel(doc, { qrSrc, termico })}`
}

export function cuerpoCambioHtml(doc, { termico = false, qrSrc = '' } = {}) {
  const total = doc.direccion === 'ninguna' ? 'Sin diferencia' : `Total ${doc.rotuloTotal.toLowerCase()}`
  return `
    <div class="cols">${bloquesCliente(doc, [doc.motivo ? `Motivo: ${doc.motivo}` : ''])}</div>
    <div class="card"><div class="label">Devueltos</div>${tablaItems(doc.devueltos, termico)}<table class="totals venta">${fila('Subtotal devueltos', signo(doc.subtotalDevueltosPyg))}</table></div>
    <div class="card"><div class="label">Nuevos</div>${tablaItems(doc.nuevos, termico)}<table class="totals venta">${fila('Subtotal nuevos', signo(doc.subtotalNuevosPyg))}</table></div>
    <table class="totals venta">${fila(total, gs(doc.totalCambioPyg), 'total')}</table>
    ${doc.medio ? `<div class="card"><div class="label">${doc.direccion === 'cobrar' ? 'Pago' : 'Reembolso'}</div><table class="pagos">${fila(doc.medio, gs(doc.totalCambioPyg))}</table></div>` : ''}
    ${piePapel(doc, { qrSrc, termico })}`
}

// Recibo de regalo: tabla de artículo y cantidad; no existe ninguna columna ni
// importe de precio.
export function cuerpoRegaloHtml(doc, { termico = false, qrSrc = '' } = {}) {
  const filas = doc.items.map((item) => `<tr><td><strong>${esc(item.description)}</strong></td><td class="cant">${esc(String(item.quantity))}</td></tr>`).join('')
  return `
    <table><thead><tr><th>Artículo</th><th class="cant">Cant.</th></tr></thead><tbody>${filas || '<tr><td colspan="2" class="muted">Sin artículos.</td></tr>'}</tbody></table>
    ${pieDocumentoHtml({ condiciones: doc.politica, qrSrc, enlace: doc.enlace, termico, rotulo: 'Garantía y condiciones' })}`
}

// Tarjeta de regalo: el saldo es la línea de total; el QR y el código
// enmascarado van en el pie, como el QR de la venta.
export function cuerpoTarjetaRegaloHtml(doc, { qrSrc = '' } = {}) {
  return `
    ${tarjeta('Tarjeta', `<strong style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em">${esc(doc.codigoEnmascarado)}</strong><br>${esc(doc.vigencia)}`)}
    <table class="totals venta">${fila('Saldo', gs(doc.montoPyg), 'total')}</table>
    ${pieDocumentoHtml({ condiciones: 'Guardá esta tarjeta: quien tenga el código puede usar el saldo. Se canjea en el cobro de la tienda.', qrSrc, tieneQr: Boolean(doc.qr), rotuloQr: 'Escaneá para canjear' })}`
}

export function pieOperacionHtml(doc) {
  const nombre = datosEncabezado({ tenant: doc.tenant || (doc.empresa ? { name: doc.empresa } : null) }).razon
  return `<footer>Generado por ${esc(APP_NAME)}${nombre ? ` para ${esc(nombre.replace(/\.$/, ''))}` : ''}.</footer>`
}
