// Cuerpo HTML de los papeles por operación (#426). Puro (sin DOM ni alias): el
// encabezado, los estilos base y el envoltorio los pone `OperacionReceipt.jsx`
// con el sistema compartido de la venta (#402); acá solo el contenido y los
// estilos propios de las cajas. Gris + un acento, legible en blanco y negro.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'

const esc = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
const signo = (monto) => (Number(monto) < 0 ? `− ${gs(Math.abs(monto))}` : gs(monto))

// Estilos de las cajas de total y de la tarjeta; se suman a `styles()`.
export const estilosOperacion = (termico) => `
  .caja-total{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border:2px solid var(--tinta);padding:${termico ? '6px 8px' : '9px 12px'};margin:10px 0;font-weight:800}
  .caja-total .rot{font-size:${termico ? '10px' : '12px'};letter-spacing:.1em;text-transform:uppercase}
  .caja-total .imp{font-size:${termico ? '16px' : '21px'};white-space:nowrap}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--gris);margin:12px 0 0}
  td.neg{color:var(--tinta)}
  tr.sub td{border-top:1px solid var(--tinta);font-weight:700}
  .tarjeta{border:2px solid var(--tinta);text-align:center;padding:${termico ? '10px 6px' : '18px 12px'};margin:10px 0}
  .tarjeta .monto{font-size:${termico ? '24px' : '38px'};font-weight:800;letter-spacing:-.01em;line-height:1.1}
  .tarjeta .codigo{font:700 ${termico ? '13px' : '17px'} ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;margin-top:8px}
  .nota{font-size:${termico ? '9.5px' : '11px'};color:var(--tinta-2);line-height:1.5;margin:8px 0}
`

const caja = (rotulo, importe) => `<div class="caja-total"><span class="rot">${esc(rotulo)}</span><span class="imp">${esc(importe)}</span></div>`

function tablaItems(items, termico) {
  const filas = items.map((item) => {
    const detalle = `<strong>${esc(item.description)}</strong>${(item.seriales || []).map((serie) => `<span class="imei">IMEI/Serie ${esc(serie)}</span>`).join('')}`
    return termico
      ? `<tr class="it"><td colspan="2">${detalle}</td></tr><tr><td class="muted">${esc(String(item.quantity))} × ${esc(gs(Math.abs(item.unitPricePyg)))}</td><td class="num neg">${esc(signo(item.totalPyg))}</td></tr>`
      : `<tr><td>${detalle}</td><td class="cant">${esc(String(item.quantity))}</td><td class="num">${esc(gs(Math.abs(item.unitPricePyg)))}</td><td class="num neg"><strong>${esc(signo(item.totalPyg))}</strong></td></tr>`
  }).join('')
  const columnas = termico ? '' : '<thead><tr><th>Producto</th><th class="cant">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead>'
  return `<table>${columnas}<tbody>${filas || `<tr><td colspan="${termico ? 2 : 4}" class="muted">Sin artículos.</td></tr>`}</tbody></table>`
}

const fila = (rotulo, valor, clase = '') => `<tr${clase ? ` class="${clase}"` : ''}><td>${esc(rotulo)}</td><td class="num">${esc(valor)}</td></tr>`

export function cuerpoDevolucionHtml(doc, { termico = false } = {}) {
  return `
    ${doc.cliente ? `<div class="card"><div class="label">Cliente</div><div><strong>${esc(doc.cliente)}</strong></div></div>` : ''}
    ${tablaItems(doc.items, termico)}
    ${doc.motivo ? `<p class="nota">Motivo: ${esc(doc.motivo)}</p>` : ''}
    <div class="sec">Reembolso</div>
    <table class="totals venta">${doc.metodos.map((metodo) => fila(metodo.label, signo(metodo.amountPyg))).join('')}</table>
    ${caja('Total reembolsado', signo(doc.totalReembolsoPyg))}`
}

export function cuerpoCambioHtml(doc, { termico = false } = {}) {
  return `
    ${doc.cliente ? `<div class="card"><div class="label">Cliente</div><div><strong>${esc(doc.cliente)}</strong></div></div>` : ''}
    <div class="sec">Devueltos</div>
    ${tablaItems(doc.devueltos, termico)}
    <table class="totals venta">${fila('Subtotal devueltos', signo(doc.subtotalDevueltosPyg), 'sub')}</table>
    <div class="sec">Nuevos</div>
    ${tablaItems(doc.nuevos, termico)}
    <table class="totals venta">${fila('Subtotal nuevos', signo(doc.subtotalNuevosPyg), 'sub')}</table>
    ${doc.motivo ? `<p class="nota">Motivo: ${esc(doc.motivo)}</p>` : ''}
    <div class="sec">Total de cambios</div>
    ${caja(doc.rotuloTotal, gs(doc.totalCambioPyg))}
    ${doc.medio ? `<table class="totals venta">${fila(doc.direccion === 'cobrar' ? 'Medio de pago' : 'Medio de reembolso', doc.medio)}</table>` : ''}`
}

// Recibo de regalo: tabla de artículo y cantidad; no existe ninguna columna ni
// importe de precio.
export function cuerpoRegaloHtml(doc) {
  const filas = doc.items.map((item) => `<tr><td><strong>${esc(item.description)}</strong></td><td class="cant">${esc(String(item.quantity))}</td></tr>`).join('')
  return `
    <table><thead><tr><th>Artículo</th><th class="cant">Cant.</th></tr></thead><tbody>${filas || `<tr><td colspan="2" class="muted">Sin artículos.</td></tr>`}</tbody></table>
    <div class="pie-doc"><div class="condiciones"><strong>Cambios</strong>${esc(doc.politica)}</div></div>`
}

export function cuerpoTarjetaRegaloHtml(doc, { qrSrc = '' } = {}) {
  return `
    <div class="tarjeta">
      <div class="sec" style="margin:0 0 4px">Saldo</div>
      <div class="monto">${esc(gs(doc.montoPyg))}</div>
      ${qrSrc ? `<img class="qr" src="${qrSrc}" alt="QR del código de la tarjeta">` : ''}
      <div class="codigo">${esc(doc.codigoEnmascarado)}</div>
      <div class="nota">${esc(doc.vigencia)}</div>
    </div>
    <p class="nota">Guardá esta tarjeta: quien tenga el código puede usar el saldo. Se canjea en el cobro de la tienda.</p>`
}

export function pieOperacionHtml(doc) {
  return `<footer>Documento no fiscal. Generado por ${esc(APP_NAME)}${doc.empresa ? ` para ${esc(String(doc.empresa).replace(/\.$/, ''))}` : ''}.</footer>`
}
