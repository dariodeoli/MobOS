import { gs } from '@/utils/calculos'
import { printHtml, escapeHtml } from '@/utils/printHtml'
import { APP_NAME } from '@/lib/brand'
import { ESTADO_ENTREGA } from '@/lib/estadosPedido'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { ahorroDeLinea } from '@/utils/precioLista'
import { totalesPedido } from '@/utils/pedido'
import { datosDeCodigo, formatoDeCodigo, ETIQUETA_FORMATO } from '@/lib/printing/codigos'
import { contextoEtiquetaUnidad, datosEtiquetaUnidad } from '@/lib/printing/etiquetaUnidad'
import { estadoGarantia, fechaVerificacionInforme } from '@/lib/printing/informeDispositivo'
import { estadoChecklist, fechaCortaDocumento, fechaHoraDocumento } from '@/lib/printing/certificado'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { api } from '@/lib/api/client'
import { getLogoDataUrl } from '@/lib/tenantLogo'

import { publicUrls } from '@/lib/urls'

const publicBase = () =>
  String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')

// Los enlaces del pedido viven en el portal de clientes (#197): la base propia
// del entorno manda; si no, la canónica del subdominio.
const pedidoBase = () =>
  String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') || publicUrls.clientPortal

// Remito de traslado entre sucursales: lista completa de IMEI para control
// físico al recibir, con origen, destino, fecha y guía AEX si ya está. Si el
// traslado tiene enlace público, el QR deja confirmar la recepción al destino.
export async function printTransferReceipt(transfer, { format = 'a4' } = {}) {
  const thermal = Boolean(thermalWidth(format))
  const lines = Array.isArray(transfer.lines) ? transfer.lines : []
  const lineas = lines.map((line) => {
    const seriales = Array.isArray(line.serials) ? line.serials : []
    return `<div class="item"><strong>${escapeHtml(line.sourceProduct?.name || 'Producto')} × ${escapeHtml(line.quantity || 1)}</strong>${seriales.length ? `<div class="serials">${seriales.map((serial) => escapeHtml(serial)).join('<br>')}</div>` : ''}</div>`
  }).join('')
  const enlace = transferReceiveUrlFor(transfer?.publicToken)
  let qr = ''
  try { if (enlace) qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* el enlace queda impreso igual */ }
  const recepcion = enlace ? `${qr ? `<img class="qr" src="${qr}" alt="QR de recepción">` : ''}<p class="small">Confirmá la recepción escaneando el QR o desde ${escapeHtml(enlace)}</p>` : ''
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remito de traslado</title><style>@page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '4mm' : '16mm'}}body{font:${thermal ? '10px' : '13px'} system-ui,sans-serif;margin:0;color:#111;max-width:${thermal ? '72mm' : '760px'}}h1{font-size:${thermal ? '15px' : '20px'};margin:0 0 4px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.items{margin:14px 0;border-top:1px dashed #999}.item{padding:8px 0;border-bottom:1px dashed #999}.serials{font-size:9px;line-height:1.5;color:#333;margin-top:4px}.qr{display:block;width:${thermal ? '32mm' : '42mm'};height:${thermal ? '32mm' : '42mm'};margin:12px auto 4px}.small{font-size:10px;word-break:break-all;text-align:center;color:#555}@media print{body{margin:0}}</style></head><body><h1>Remito de traslado</h1><p class="muted">${escapeHtml(transfer.sourceBranch?.name || 'Origen')} → ${escapeHtml(transfer.destinationBranch?.name || 'Destino')} · ${transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-PY') : ''}</p><div class="items">${lineas}</div>${transfer.aexGuide ? `<div class="row"><span>Guía AEX</span><span>${escapeHtml(transfer.aexGuide)}</span></div>` : ''}${transfer.createdBy?.name ? `<div class="row"><span>Generado por</span><span>${escapeHtml(transfer.createdBy.name)}</span></div>` : ''}${transfer.receivedAt ? `<div class="row"><span>Recibido</span><span>${escapeHtml(new Date(transfer.receivedAt).toLocaleString('es-PY'))}${transfer.receivedNote ? ` · ${escapeHtml(transfer.receivedNote)}` : ''}</span></div>` : ''}${transfer.notes ? `<p class="muted">${escapeHtml(transfer.notes)}</p>` : ''}${recepcion}</body></html>`
  return printHtml(html)
}

// Etiqueta de producto/góndola: nombre, precio, SKU y código de barras sobre
// el SKU (EAN-13 si el SKU lo es; si no, CODE128). El precio puede venir ya
// resuelto (`precioPyg` de la lista del cliente o del escalón); sin eso se usa
// pricePyg. `cantidad` repite la etiqueta, en térmica una por página y en A4
// en grilla.
const normalizarEtiqueta = (item = {}) => {
  const product = item.product || item
  return {
    product,
    cantidad: Math.max(1, Math.min(99, Number(item.cantidad) || 1)),
    precioPyg: item.precioPyg ?? null,
    lista: item.lista || '',
  }
}

export async function buildProductLabelsHtml(items = [], { format = 'thermal-58' } = {}) {
  const width = thermalWidth(format) || (format === 'a4' ? 0 : 58)
  const etiquetas = []
  for (const item of Array.isArray(items) ? items : []) {
    const { product, cantidad, precioPyg, lista } = normalizarEtiqueta(item)
    const nombre = product?.name || product?.nombre || 'Producto'
    const sku = String(product?.sku || '')
    const codigo = sku || String(product?.id || '')
    const formatoCodigo = formatoDeCodigo(codigo)
    const precio = Number(precioPyg ?? product?.pricePyg ?? product?.precioVenta ?? 0)
    let barras = ''
    if (codigo) {
      try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        JsBarcode(svg, datosDeCodigo(codigo), {
          format: formatoCodigo === 'ean13' ? 'EAN13' : 'CODE128',
          displayValue: true,
          fontSize: 11,
          textMargin: 1,
          height: 42,
          width: 1.6,
          margin: 0,
        })
        barras = `<div class="barcode">${svg.outerHTML}<span class="code-label">${escapeHtml(ETIQUETA_FORMATO[formatoCodigo])}</span></div>`
      } catch { /* sin barras, la etiqueta conserva nombre, precio y SKU */ }
    }
    for (let copia = 0; copia < cantidad; copia += 1) {
      etiquetas.push(`<section class="label"><div class="brand"><span>${escapeHtml(APP_NAME)}</span><span>ETIQUETA DE PRODUCTO</span></div><div class="name">${escapeHtml(nombre)}</div><div class="price">${precio > 0 ? escapeHtml(gs(precio)) : '—'}</div>${lista ? `<div class="list">Lista: ${escapeHtml(lista)}</div>` : ''}<div class="sku">${sku ? `SKU ${escapeHtml(sku)}` : 'Sin SKU'}${cantidad > 1 ? ` · Etiqueta ${copia + 1} de ${cantidad}` : ''}</div>${barras}<footer>Verificá el precio con el lector del local.</footer></section>`)
    }
  }
  const anchoHoja = width ? `${width}mm auto` : 'A4'
  const margenHoja = width ? '2mm' : '12mm'
  const anchoCuerpo = width ? `${width - 4}mm` : '186mm'
  const cuerpo = width ? 'display:block' : 'display:grid;grid-template-columns:repeat(3,1fr);gap:4mm'
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de producto</title><style>@page{size:${anchoHoja};margin:${margenHoja}}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0 auto;max-width:${anchoCuerpo};font:11px/1.35 ui-sans-serif,system-ui,sans-serif;color:#0f1720;${cuerpo}}.label{page-break-after:always;border-bottom:1px dashed #999;padding:1mm 0 2mm;text-align:center}.label:last-child{page-break-after:auto;border-bottom:0}.brand{display:flex;justify-content:space-between;gap:2mm;font-size:7px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0c8876;border-bottom:1px solid #d5dbe0;padding-bottom:1mm;margin-bottom:1.5mm}.name{font-size:12px;font-weight:800;min-height:2.4em}.price{font-size:22px;font-weight:900;margin:1mm 0}.list{font-size:8px;color:#555}.sku{font-size:8px;color:#555}.barcode{margin-top:1.5mm}.barcode svg{width:100%;height:auto;max-height:14mm}.code-label{display:block;font-size:6.5px;letter-spacing:.14em;color:#66707a}footer{margin-top:1mm;font-size:7px;color:#66707a}@media print{.label{margin-bottom:0;padding-bottom:1.5mm}}</style></head><body>${etiquetas.join('')}</body></html>`
  return html
}

// Compatibilidad: la etiqueta de precio clásica ahora es la de producto con
// código de barras (una sola copia).
export async function printPriceLabel(product, { format = 'thermal-58' } = {}) {
  return printHtml(await buildProductLabelsHtml([{ product, cantidad: 1 }], { format }))
}

// Etiquetas de unidades de stock (#220): modelo, identificador, IMEI/serial
// completo legible, código QR y código de barras en bloques separados, con el
// ancho real del rollo (58 u 80 mm). `ancho` es el de la impresora configurada;
// cada etiqueta corta su propia página. Es el respaldo del diálogo y la fuente
// del PDF cuando no hay agente ni puente.
export async function buildUnitLabelsHtml(units = [], { ancho = 58, base = '' } = {}) {
  const lista = Array.isArray(units) ? units : []
  const anchoMm = Number(ancho) === 80 ? 80 : 58
  const etiquetas = []
  for (const unit of lista) {
    const datos = datosEtiquetaUnidad(unit, { base: base || publicBase() })
    const contexto = contextoEtiquetaUnidad(datos)
    let qr = ''
    try {
      if (datos.enlace) qr = await QRCode.toDataURL(datos.enlace, { errorCorrectionLevel: 'M', margin: 0, width: anchoMm === 80 ? 220 : 180 })
    } catch { /* sin QR queda el código de barras y el código de unidad como texto */ }
    let barras = ''
    if (datos.codigo) {
      try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        JsBarcode(svg, datos.codigo, { format: 'CODE128', displayValue: false, width: 1.6, height: 38, margin: 0 })
        barras = svg.outerHTML
      } catch { /* sin barras queda el código de unidad como texto */ }
    }
    etiquetas.push(`<section class="etiqueta">
      <div class="marca"><span>${escapeHtml(APP_NAME)} · ETIQUETA</span><span>STOCK</span></div>
      <div class="bloque modelo"><div class="rotulo">Modelo</div><div class="modelo">${escapeHtml(datos.modelo)}</div>${contexto ? `<div class="contexto">${escapeHtml(contexto)}</div>` : ''}</div>
      <div class="bloque"><div class="rotulo">Identificador</div><div class="identificador">${escapeHtml(datos.identificador)}</div></div>
      <div class="bloque"><div class="rotulo">IMEI / Serial</div><div class="serial">${escapeHtml(datos.serial || '—')}</div></div>
      <div class="bloque codigo"><div class="rotulo">Código QR</div>${qr ? `<img class="qr" src="${qr}" alt="QR de la unidad">` : '<div class="sin-codigo">QR no disponible</div>'}</div>
      <div class="bloque codigo"><div class="rotulo">Código de unidad</div>${barras ? `<div class="barras">${barras}</div>` : ''}<div class="valor">${escapeHtml(datos.codigo || '—')}</div></div>
      <div class="pie">Escaneá el QR para abrir la unidad o usá el código de barras en el local.</div>
    </section>`)
  }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de unidades (${lista.length})</title><style>@page{size:${anchoMm}mm auto;margin:2mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0 auto;max-width:${anchoMm - 4}mm;font:10px/1.35 ui-sans-serif,system-ui,sans-serif;color:#0f1720}.etiqueta{page-break-after:always}.etiqueta:last-child{page-break-after:auto}.marca{display:flex;justify-content:space-between;gap:2mm;font-size:7px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0c8876;border-bottom:1px solid #d5dbe0;padding-bottom:1mm;margin-bottom:1.5mm}.bloque{border:1px solid #cfd6db;border-radius:2mm;padding:1.6mm 2mm;margin-top:1.6mm;text-align:center}.rotulo{font-size:6.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#66707a}.modelo{font-size:12.5px;font-weight:800;line-height:1.2;margin-top:.6mm;text-align:left}.contexto{font-size:7.5px;color:#66707a;margin-top:.8mm;text-align:left}.identificador{font-size:26px;font-weight:900;letter-spacing:3px;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:.4mm}.serial{font-size:${anchoMm === 80 ? 15 : 14}px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.06em;margin-top:.6mm;white-space:nowrap}.qr{width:${anchoMm === 80 ? 30 : 26}mm;height:${anchoMm === 80 ? 30 : 26}mm;margin:1mm auto .4mm;display:block}.barras{margin-top:.8mm}.barras svg{width:100%;height:auto;max-height:14mm}.valor{font-size:7.5px;font-family:Menlo,Consolas,monospace;word-break:break-all;color:#333;margin-top:.6mm}.sin-codigo{font-size:8px;color:#66707a;padding:2mm 0}.pie{margin-top:5mm;font-size:6.5px;color:#66707a;text-align:center}@media print{.etiqueta{margin:0}}</style></head><body>${etiquetas.join('')}</body></html>`
  return html
}

export const trackingUrlFor = (order) => {
  // El QR del comprobante abre la página pública del pedido (estado + garantías).
  const base = pedidoBase()
  return order?.publicToken && base ? `${base}/pedidos/${encodeURIComponent(order.publicToken)}` : ''
}

// Enlace privado del nivel de comprobante (rápido | completo | detallado).
export const accessUrlFor = (token) => {
  const base = pedidoBase()
  return token && base ? `${base}/pedidos/${encodeURIComponent(token)}` : ''
}

// Enlace público de la cotización: el cliente acepta o rechaza desde el QR.
export const quoteUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/cotizacion/${encodeURIComponent(token)}` : ''
}

// Enlace público del remito de traslado: el destino confirma la recepción.
export const transferReceiveUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/remito/${encodeURIComponent(token)}` : ''
}


const THERMAL_WIDTHS = { 'thermal-80': 80, 'thermal-58': 58, 'thermal-55': 55, thermal: 58 }
const thermalWidth = (format) => THERMAL_WIDTHS[format] || 0
const styles = (format) => {
  const width = thermalWidth(format)
  // Cada formato reserva su propio margen: A4 respira a los lados y arriba/abajo;
  // las térmicas centran la columna en el rollo con padding parejo (el papel
  // suele ser más ancho que el área imprimible real).
  const page = width ? `${width}mm auto` : 'A4'
  const margin = width ? '5mm 4mm' : '18mm 16mm'
  const bodyMax = width ? `${width - 8}mm` : '178mm'
  const baseFont = width ? '10px/1.45' : '13px/1.6'
  const brandSize = width ? '12px' : '13px'
  const h1Size = width ? '15px' : '20px'
  const totalSize = width ? '14px' : '16px'
  const qrSize = width ? `${width === 80 ? 42 : 32}mm` : '42mm'
  return `
  @page{size:${page};margin:${margin}}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:${baseFont} ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;margin:0 auto;color:#0f1720;max-width:${bodyMax};padding:${width ? '1mm 0 6mm' : '0 0 4mm'}}
  .brand{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:2px solid #0c8876;padding-bottom:8px;margin-bottom:14px}
  .brand b{font-size:${brandSize};color:#0c8876;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
  .brand span{font-size:10px;color:#66707a;text-transform:uppercase;letter-spacing:.12em}
  h1{font-size:${h1Size};margin:0 0 2px;letter-spacing:-.01em}
  .muted{color:#66707a}
  .meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;margin:6px 0 0}
  .card{border:1px solid #e3e8ec;border-radius:10px;padding:10px 12px;margin:10px 0}
  .card .label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#66707a;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#66707a;text-align:left;font-weight:600}
  td,th{padding:6px 0;border-bottom:1px dashed #d5dbe0;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .totals td{border:0;padding:3px 0}
  .totals tr:last-child td{font-weight:700;font-size:${totalSize};border-top:1px solid #0f1720;padding-top:6px}
  .totals tr.saldo td{font-weight:800;font-size:${totalSize};color:#000;border-top:1px solid #0f1720;padding-top:6px}
  .tag{display:inline-block;border:1px solid #0c8876;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0c8876}
  .brand img.logo{display:block;height:${width ? (width === 80 ? '14mm' : '12mm') : '16mm'};max-width:${width ? `${width - 20}mm` : '70mm'};object-fit:contain;margin:0 auto 4px}
  .qr{display:block;width:${qrSize};height:${qrSize};margin:10px auto 6px}
  .small{font-size:10px;word-break:break-all;text-align:center}
  .nofiscal{border:2px solid #0f1720;padding:6px 8px;text-align:center;font-weight:800;letter-spacing:.05em;font-size:${width ? '10px' : '11px'};margin:12px 0}
  .firmas{display:flex;flex-wrap:wrap;gap:${width ? '12px 0' : '22px 26px'};margin:24px 0 6px;font-size:11px}
  /* Espacio real para firmar a mano (#206): 18 mm libres arriba de la línea.
     Los campos de aclaración, CI y fecha quedan debajo, con aire. En el rollo
     cada firma ocupa la columna completa (rol + campos en líneas cortas). */
  .firma{flex:1 1 ${width ? '100%' : '44%'};min-width:${width ? '0' : '72mm'};border-top:1px solid #0f1720;padding-top:18mm}
  .firma .rol{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#66707a;margin-bottom:3mm}
  .firma .campos{color:#333;padding:2mm 0;border-bottom:1px dotted #9aa4ad}
  .observaciones{margin:14px 0 8px;border:1px solid #e3e8ec;border-radius:10px;padding:10px 12px}
  .observaciones .label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#66707a}
  .observaciones .linea{border-bottom:1px dotted #9aa4ad;height:11mm}
  footer{margin-top:14px;border-top:1px solid #e3e8ec;padding-top:8px;font-size:10px;color:#66707a;text-align:center}
  @media print{body{margin:0;color:#000}.muted{color:#222}.card,table,td,th,footer,.brand,.nofiscal,.firma,.observaciones,.firma .campos,.observaciones .linea{border-color:#000}.brand b,.tag,.firma .rol{color:#000}.tag{border-color:#000}}
`
}

// Leyenda de los documentos no fiscales: tiene que verse, no esconderse en el
// pie. El nombre completo del documento va en el encabezado.
const avisoNoFiscal = () => '<div class="nofiscal">Documento no fiscal · No válido como factura</div>'

// Bloques de firma y observaciones (#206): espacio real para escribir a mano.
// `bloques` acepta strings (rol) u objetos { rol, nota }; con
// `{ observaciones: true }` agrega el área de observaciones con líneas.
// `estrecho` (térmicos): los campos van en líneas cortas, como el bloque
// ESC/POS, para que no se encimen al ancho del rollo.
const firmas = (bloques = [], { observaciones = false, lineasObservaciones = 2, estrecho = false } = {}) => {
  const campos = estrecho
    ? '<div class="campos">Aclaración: ______________________</div><div class="campos">CI: ______________________</div><div class="campos">Fecha: ____/____/______</div>'
    : '<div class="campos">Aclaración: ______________________________</div><div class="campos">CI: ____________________  Fecha: ____/____/______</div>'
  const celdas = bloques.map((bloque) => {
    const rol = typeof bloque === 'string' ? bloque : bloque?.rol
    const nota = typeof bloque === 'object' && bloque?.nota ? `<div class="campos">${escapeHtml(bloque.nota)}</div>` : ''
    return `<div class="firma"><div class="rol">${escapeHtml(rol || 'Firma')}</div>${nota}${campos}</div>`
  }).join('')
  const area = observaciones
    ? `<div class="observaciones"><div class="label">Observaciones</div>${'<div class="linea"></div>'.repeat(Math.max(1, lineasObservaciones))}</div>`
    : ''
  return `<div class="firmas">${celdas}</div>${area}`
}


const header = (title, when, logo = '') => `<div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : `<b>${escapeHtml(APP_NAME)}</b>`}<span>${escapeHtml(title)}</span></div><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(when)}</p>`
const footer = () => `<footer>Conservá este comprobante para cambios y garantía. Documento generado por ${escapeHtml(APP_NAME)}.</footer>`

// Niveles de comprobante y formatos físicos, independientes entre sí.
// Modelos de comprobante: cada uno suma una capa de información sobre el
// anterior. Esta tabla es la única fuente de verdad de los modelos (los ids son
// los mismos que valida el backend): sumar un modelo nuevo es agregar una fila
// y, si aporta algo distinto, una sección en los constructores de HTML/ticket.
export const MODELOS_COMPROBANTE = [
  { id: 'rapido', label: 'Rápido', icon: 'receipt', empresa: 'compacta', clienteContacto: false, pagos: false, credito: false, cronologia: false, redes: false },
  { id: 'completo', label: 'Completo', icon: 'eye', empresa: 'completa', clienteContacto: true, pagos: true, credito: true, cronologia: false, redes: true },
  { id: 'detallado', label: 'Detallado', icon: 'clock', empresa: 'completa', clienteContacto: true, pagos: true, credito: true, cronologia: true, redes: true },
]
export const modeloComprobante = (id) => MODELOS_COMPROBANTE.find(modelo => modelo.id === id) || MODELOS_COMPROBANTE[1]
export const NIVELES_COMPROBANTE = MODELOS_COMPROBANTE.map(modelo => [modelo.id, modelo.label])
// Niveles con su icono: una sola definición para todo el sistema (#208).
export const NIVELES_MODELO = MODELOS_COMPROBANTE.map(({ id, label, icon }) => ({ id, label, icon }))
export const FORMATOS_COMPROBANTE = [['a4', 'A4'], ['thermal-80', '80 mm'], ['thermal-58', '58 mm']]
// La página del pedido usa A4 o el rollo de 58 mm (con diseño propio).
// #207: la impresora de la tienda es de 80 mm: va primero (predeterminada)
// sin sacar A4 ni 58 mm para quien los elija.
export const FORMATOS_PEDIDO = [['thermal-80', '80 mm'], ['a4', 'A4'], ['thermal-58', '58 mm']]
const PREF_NIVEL = 'mobos:comprobante:nivel'
const PREF_FORMATO = 'mobos:comprobante:formato'
// #208: sin preferencia guardada, el comprobante sale en «Rápido»; la última
// combinación usada al imprimir queda recordada.
export const nivelPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_NIVEL)) || 'rapido'
// #207: sin preferencia guardada, el comprobante sale en 80 mm (la
// impresora de la tienda); la elección manual se respeta.
export const formatoPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_FORMATO)) || 'thermal-80'
// Formato térmico configurado (80 mm por defecto: es la impresora habitual).
export const formatoTermicoPreferido = () => {
  const preferido = formatoPreferido()
  return preferido.startsWith('thermal') ? preferido : 'thermal-80'
}
export const recordarPreferencia = (nivel, formato) => {
  try { localStorage.setItem(PREF_NIVEL, nivel); localStorage.setItem(PREF_FORMATO, formato) } catch { /* sin almacenamiento */ }
}

// Cada comprobante imprime el QR de su propio nivel: el token autoriza esa
// vista. Es el token de impresión (impreso=true), que el panel no lista ni
// revoca al regenerar enlaces: el papel sigue funcionando.
import { isDemoRuntime } from '@/lib/demoMode'
import { tokenDeNivelDemo } from '@/lib/printing/demo'

export async function tokenDeNivel(orderId, level) {
  if (!orderId) return ''
  // Demo (#194/#204): token ficticio estable, sin tocar el API real.
  if (isDemoRuntime) return tokenDeNivelDemo(orderId, level)
  try {
    const data = await api.post(`/api/orders/${encodeURIComponent(orderId)}/access-tokens`, { level, impreso: true })
    return data?.token || ''
  } catch { return '' }
}

export async function buildOrderReceiptHtml(ordenViva, { level = 'completo', format = 'a4', token = '' } = {}) {
  // Comprobante congelado al emitir: si la venta lo tiene, se imprime lo que
  // quedó guardado y no los datos vivos (producto, cliente o empresa editados).
  const congelado = ordenViva?.receiptSnapshot?.datos
  const order = congelado && typeof congelado === 'object' ? { ...ordenViva, ...congelado } : ordenViva
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const pagosConfirmados = payments.filter(payment => payment.status === 'CONFIRMED' || payment.status === undefined)
  const { total, pagado: paid, pendiente } = totalesPedido(order)
  const when = order.createdAt || order.creadoEn || order.fecha
  const link = token ? accessUrlFor(token) : trackingUrlFor(order)
  let qr = ''
  try { if (link) qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'H', margin: 2, width: 320 }) } catch { /* el enlace queda impreso igual */ }
  const itemsCount = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null
  const modelo = modeloComprobante(level)
  const completo = modelo.pagos
  const detallado = modelo.cronologia
  const textoEvento = (evento) => evento.type === 'created' ? 'Pedido creado' : evento.type === 'payment' ? `Pago ${gs(evento.amountPyg || 0)}${evento.methodLabel ? ` · ${evento.methodLabel}` : ''}` : `Entrega: ${ESTADO_ENTREGA[evento.metadata?.current] || evento.metadata?.current || 'actualizada'}`

  const documento = order.billingName ? `<div class="card"><div class="label">Factura a</div><div>${escapeHtml(order.billingName)}${order.billingDocument ? ` · RUC ${escapeHtml(order.billingDocument)}` : ''}</div></div>` : ''
  const itemsRows = items.map(item => {
    const { ahorro } = ahorroDeLinea(item)
    return `<tr><td>${escapeHtml(item.description || item.nombre || 'Producto')}${ahorro > 0 ? `<br><span class="muted">descuento − ${escapeHtml(gs(ahorro))}</span>` : ''}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? item.precio ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? item.precio ?? 0)))}</td></tr>`
  }).join('')
  const contactoCliente = modelo.clienteContacto && cliente
    ? `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente.name || order.cliente || 'Consumidor final')}</strong>${cliente.document ? ` · ${escapeHtml(cliente.document)}` : ''}${cliente.phone ? `<br>${escapeHtml(cliente.countryCode || '')} ${escapeHtml(cliente.phone)}` : ''}${cliente.email ? `<br>${escapeHtml(cliente.email)}` : ''}${(cliente.addresses || []).map(address => `<br>${escapeHtml([address.address, address.city, address.department, address.country].filter(Boolean).join(', '))}`).join('')}</div></div>`
    : `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente?.name || order.cliente || 'Consumidor final')}</strong></div></div>`
  const empresaTenant = order.tenant || null
  const empresaDireccion = [empresaTenant?.address, empresaTenant?.city, empresaTenant?.department].filter(Boolean).join(', ')
  const sucursalTexto = [sucursal?.name, sucursal?.address, sucursal?.city, sucursal?.department].filter(Boolean).join(' · ')
  const redes = modelo.redes ? [empresaTenant?.email, sucursal?.instagram ? `@${sucursal.instagram}` : ''].filter(Boolean).join(' · ') : ''
  // El comprobante rápido también identifica a la empresa y la sucursal que
  // vendió; el completo agrega dirección, RUC, contacto y redes.
  const empresaCard = modelo.empresa === 'completa'
    ? `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${empresaTenant?.ruc ? ` · RUC ${escapeHtml(empresaTenant.ruc)}` : ''}${empresaDireccion ? `<br>${escapeHtml(empresaDireccion)}` : ''}${empresaTenant?.phone ? `<br>${escapeHtml(empresaTenant.phone)}` : ''}${sucursal?.name || sucursal?.address || sucursal?.city ? `<br>${escapeHtml(sucursalTexto)}` : ''}${sucursal?.phone ? `<br>${escapeHtml(sucursal.phone)}` : ''}${order.seller?.name ? `<br>Vendedor: ${escapeHtml(order.seller.name)}` : ''}${redes ? `<br>${escapeHtml(redes)}` : ''}</div></div>`
    : modelo.empresa === 'compacta'
      ? `<div class="card"><div class="label">Empresa</div><div>${escapeHtml([empresa || APP_NAME, sucursal?.name].filter(Boolean).join(' · '))}</div></div>`
      : ''
  const metodoPago = [...new Set(pagosConfirmados.map(payment => ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'))].join(' · ')
  const pagosRows = modelo.pagos && pagosConfirmados.length
    ? `<div class="card"><div class="label">Pagos</div><table class="totals">${pagosConfirmados.map(payment => `<tr><td>${escapeHtml(ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago')}${completo && (payment.reference || payment.cuenta || payment.accountSnapshot?.name) ? ` · ${escapeHtml(payment.reference || payment.cuenta || payment.accountSnapshot.name)}` : ''}${detallado && (payment.paidAt || payment.createdAt) ? `<br><span class="muted">${escapeHtml(new Date(payment.paidAt || payment.createdAt).toLocaleString('es-PY'))}</span>` : ''}</td><td class="num">${escapeHtml(gs(payment.amountPyg ?? payment.monto ?? 0))}</td></tr>`).join('')}</table></div>`
    : ''
  const credito = modelo.credito && Number(order.creditDays || 0) > 0
    ? `<p><span class="tag">A crédito · ${escapeHtml(String(order.creditDays))} días${order.dueAt ? ` · vence ${escapeHtml(new Date(order.dueAt).toLocaleDateString('es-PY'))}` : ''}</span></p>`
    : ''
  const cronologia = modelo.cronologia && Array.isArray(order.timeline) && order.timeline.length
    ? `<div class="card"><div class="label">Cronología</div><table class="totals">${order.timeline.map(evento => `<tr><td>${escapeHtml(textoEvento(evento))}</td><td class="num">${escapeHtml(new Date(evento.at).toLocaleString('es-PY'))}</td></tr>`).join('')}</table></div>`
    : ''
  const entregaNotas = completo && (order.deliveryType || order.deliveryNotes)
    ? `<p class="muted">Entrega: ${escapeHtml(order.deliveryType || '—')}${order.deliveryNotes ? ` · ${escapeHtml(order.deliveryNotes)}` : ''}</p>`
    : ''
  const logo = await getLogoDataUrl()

  // ── Rollo de 58 mm: diseño vertical propio ──────────────────────────────
  // Una sola columna, productos uno debajo del otro con cantidad × precio,
  // total destacado, QR escaneable y alto dinámico (`size:58mm auto`). No es el
  // A4 encogido: la jerarquía y los tamaños están pensados para el papel.
  if (format === 'thermal-58' || format === 'thermal-55') {
    const lineas = items.map(item => {
      const { ahorro } = ahorroDeLinea(item)
      const cantidad = Number(item.quantity || 1)
      const unitario = Number(item.unitPricePyg ?? item.precio ?? 0)
      const lineaTotal = Number(item.totalPyg ?? cantidad * unitario)
      return `<div class="item"><div class="name">${escapeHtml(item.description || item.nombre || 'Producto')}</div><div class="row"><span>${escapeHtml(String(cantidad))} × ${escapeHtml(gs(unitario))}</span><span>${escapeHtml(gs(lineaTotal))}</span></div>${ahorro > 0 ? `<div class="row muted"><span>descuento</span><span>− ${escapeHtml(gs(ahorro))}</span></div>` : ''}</div>`
    }).join('')
    const pagos58 = modelo.pagos && pagosConfirmados.length
      ? `<div class="sep"></div><div>Pagos</div>${pagosConfirmados.map(payment => `<div class="row"><span>${escapeHtml(ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago')}${payment.reference || payment.accountSnapshot?.name ? ` · ${escapeHtml(payment.reference || payment.accountSnapshot.name)}` : ''}</span><span>${escapeHtml(gs(payment.amountPyg ?? payment.monto ?? 0))}</span></div>`).join('')}`
      : ''
    const credito58 = modelo.credito && Number(order.creditDays || 0) > 0
      ? `<div class="row"><span>A crédito</span><span>${escapeHtml(String(order.creditDays))} días${order.dueAt ? ` · vence ${escapeHtml(new Date(order.dueAt).toLocaleDateString('es-PY'))}` : ''}</span></div>`
      : ''
    const cronologia58 = modelo.cronologia && Array.isArray(order.timeline) && order.timeline.length
      ? `<div class="sep"></div><div>Cronología</div>${order.timeline.map(evento => `<div class="row"><span>${escapeHtml(textoEvento(evento))}</span><span class="muted">${escapeHtml(new Date(evento.at).toLocaleDateString('es-PY'))}</span></div>`).join('')}`
      : ''
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>
  @page{size:58mm auto;margin:3mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:11px/1.4 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#000;width:52mm;margin:0 auto;padding:0 0 4mm}
  .center{text-align:center}
  .muted{color:#333}
  .row{display:flex;justify-content:space-between;gap:6px}
  .sep{border-top:1px dashed #000;margin:6px 0}
  h1{font-size:14px;margin:2px 0;text-align:center}
  .brand{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-top:2px}
  .brand img{display:block;height:12mm;max-width:44mm;object-fit:contain;margin:0 auto 3px}
  .item{margin:5px 0}
  .item .name{font-weight:700}
  .total{border-top:2px solid #000;margin-top:5px;padding-top:4px;align-items:baseline}
  .total span:first-child{font-weight:800}
  .total span:last-child{font-size:18px;font-weight:800}
  .qr{display:block;width:34mm;height:34mm;margin:6px auto 3px}
  .small{font-size:9px;word-break:break-all;text-align:center}
  .nofiscal{border:2px solid #000;text-align:center;font-weight:800;font-size:10px;padding:4px;margin:6px 0}
  @media print{body{margin:0}}
  </style></head><body class="t58">
    ${logo ? `<div class="brand"><img src="${logo}" alt=""></div>` : ''}
    <div class="brand">${escapeHtml(empresa || APP_NAME)}</div>
    ${sucursal?.name ? `<div class="center">${escapeHtml(sucursal.name)}</div>` : ''}
    <h1>Comprobante de compra</h1>
    <div class="center">${escapeHtml(order.orderNumber || order.codigo || 'Pedido')}</div>
    <div class="center muted">${when ? escapeHtml(new Date(when).toLocaleString('es-PY')) : ''}</div>
    <div class="sep"></div>
    <div class="row"><span>Cliente</span><span>${escapeHtml(cliente?.name || order.cliente || 'Consumidor final')}</span></div>
    ${modelo.clienteContacto && cliente?.document ? `<div class="row"><span>Documento</span><span>${escapeHtml(cliente.document)}</span></div>` : ''}
    ${modelo.clienteContacto && cliente?.phone ? `<div class="row"><span>Teléfono</span><span>${escapeHtml(`${cliente.countryCode || ''} ${cliente.phone}`.trim())}</span></div>` : ''}
    ${modelo.clienteContacto && cliente?.email ? `<div class="small">${escapeHtml(cliente.email)}</div>` : ''}
    ${order.billingName ? `<div class="row"><span>Factura a</span><span>${escapeHtml(order.billingName)}${order.billingDocument ? ` · ${escapeHtml(order.billingDocument)}` : ''}</span></div>` : ''}
    ${modelo.empresa === 'completa' && (empresaTenant?.ruc || empresaDireccion || order.seller?.name || redes) ? `<div class="sep"></div><div class="muted">${[empresaTenant?.ruc ? `RUC ${empresaTenant.ruc}` : '', empresaDireccion, order.seller?.name ? `Vendedor: ${order.seller.name}` : '', sucursal?.phone, redes].filter(Boolean).map(escapeHtml).join('<br>')}</div>` : ''}
    <div class="sep"></div>
    ${lineas || '<div class="item">Sin artículos detallados.</div>'}
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${escapeHtml(gs(order.subtotalPyg ?? total))}</span></div>
    ${Number(order.discountPyg || order.descuento || 0) ? `<div class="row"><span>Descuento</span><span>− ${escapeHtml(gs(order.discountPyg || order.descuento))}</span></div>` : ''}
    ${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<div class="row"><span>Entrega</span><span>${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</span></div>` : ''}
    <div class="row"><span>Ítems</span><span>${escapeHtml(String(itemsCount))}</span></div>
    <div class="row"><span>Pagado</span><span>${escapeHtml(gs(paid))}</span></div>
    ${pendiente > 0 ? `<div class="row"><span>Saldo pendiente</span><span>${escapeHtml(gs(pendiente))}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${escapeHtml(gs(total))}</span></div>
    ${!modelo.pagos && metodoPago ? `<div class="row"><span>Método</span><span>${escapeHtml(metodoPago)}</span></div>` : ''}
    ${credito58}
    ${pagos58}
    ${completo && (order.deliveryType || order.deliveryNotes) ? `<div class="sep"></div><div class="muted">Entrega: ${escapeHtml(order.deliveryType || '—')}${order.deliveryNotes ? ` · ${escapeHtml(order.deliveryNotes)}` : ''}</div>` : ''}
    ${cronologia58}
    <div class="sep"></div>
    <div class="center">${escapeHtml(ESTADO_ENTREGA[order.fulfillmentStatus] || order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')}</div>
    ${link ? `${qr ? `<img class="qr" src="${qr}" alt="QR del comprobante">` : ''}<div class="small">${level === 'rapido' ? 'Seguimiento' : level === 'completo' ? 'Comprobante y seguimiento' : 'Comprobante detallado'}: ${escapeHtml(link)}</div>` : ''}
    <div class="nofiscal">Documento no fiscal · No válido como factura</div>
    <div class="small">Conservá este comprobante para cambios y garantía. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</div>
  </body></html>`
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Comprobante de compra', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`, logo)}
    ${empresaCard}
    ${contactoCliente}
    ${documento}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(order.subtotalPyg ?? total))}</td></tr>
      ${Number(order.discountPyg || order.descuento || 0) ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(order.discountPyg || order.descuento))}</td></tr>` : ''}
      ${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<tr><td>Entrega</td><td class="num">${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</td></tr>` : ''}
      <tr><td>Total de ítems</td><td class="num">${escapeHtml(String(itemsCount))}</td></tr>
      <tr><td>Total</td><td class="num">${escapeHtml(gs(total))}</td></tr>
      <tr><td>Pagado</td><td class="num">${escapeHtml(gs(paid))}</td></tr>
      ${pendiente > 0 ? `<tr class="saldo"><td>Saldo pendiente</td><td class="num">${escapeHtml(gs(pendiente))}</td></tr>` : ''}
      ${!modelo.pagos && metodoPago ? `<tr><td>Método</td><td class="num">${escapeHtml(metodoPago)}</td></tr>` : ''}
    </table>
    ${pagosRows}
    ${credito}
    ${entregaNotas}
    <p><span class="tag">${escapeHtml(ESTADO_ENTREGA[order.fulfillmentStatus] || order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')}</span></p>
    ${cronologia}
    ${link ? `${qr ? `<img class="qr" src="${qr}" alt="QR del comprobante">` : ''}<p class="small">${level === 'rapido' ? 'Seguimiento' : level === 'completo' ? 'Comprobante y seguimiento' : 'Comprobante detallado'}: ${escapeHtml(link)}</p>` : ''}
    <footer>Documento no fiscal. Conservá este comprobante para cambios y garantía. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printOrderReceipt(order, options = {}) {
  const html = await buildOrderReceiptHtml(order, options)
  return printHtml(html)
}

// Recibo de un pago individual (parcial o total): sirve para entregar al
// cliente al cobrar una parte del pedido, sin repetir el comprobante completo.
export async function printPaymentReceipt(payment, order, { format = 'a4' } = {}) {
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const fecha = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo de pago</title><style>${styles(format)}</style></head><body>
    ${header('Recibo de pago', `${order?.orderNumber || order?.codigo || 'Pedido'} · ${new Date(fecha).toLocaleString('es-PY')}`, logo)}
    <div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(order?.customer?.name || order?.cliente || 'Consumidor final')}</strong></div></div>
    <table class="totals">
      <tr><td>Método</td><td class="num">${escapeHtml(metodo)}</td></tr>
      ${referencia ? `<tr><td>Cuenta / referencia</td><td class="num">${escapeHtml(referencia)}</td></tr>` : ''}
      ${payment.settlesAt ? `<tr><td>Acredita</td><td class="num">${escapeHtml(new Date(payment.settlesAt).toLocaleDateString('es-PY'))}</td></tr>` : ''}
      <tr><td>Monto cobrado</td><td class="num">${escapeHtml(gs(monto))}</td></tr>
    </table>
    <p class="muted">Este recibo corresponde a un pago parcial o total del pedido.</p>
    ${footer()}
  </body></html>`
  return printHtml(html)
}

const QUOTE_STATUS = { DRAFT: 'Borrador', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONVERTED: 'Convertida', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' }

// Cotización para el cliente: ítems, descuento, total, validez y estado, con
// el QR/enlace para aceptar o rechazar desde el mismo comprobante.
export async function printQuoteReceipt(quote, { format = 'a4', token = '' } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const enlace = quoteUrlFor(token || quote.publicToken)
  let qr = ''
  try { if (enlace) qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* el enlace queda impreso igual */ }
  const logo = await getLogoDataUrl()
  const empresa = quote.tenant?.name || quote.companyName || ''
  const sucursal = quote.branch || null
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? 0)))}</td></tr>`).join('')
  const validez = quote.validUntil ? `Válida hasta el ${new Date(quote.validUntil).toLocaleDateString('es-PY')}` : 'Sin vencimiento'
  const empresaCard = `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal.address, sucursal.city, sucursal.department].filter(Boolean).join(', '))}` : ''}${sucursal?.phone ? `<br>${escapeHtml(sucursal.phone)}` : ''}${quote.seller?.name ? `<br>Vendedor: ${escapeHtml(quote.seller.name)}` : ''}</div></div>`
  const cliente = quote.customer?.name || quote.customerName || 'Consumidor final'
  const contactoCliente = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente)}</strong>${quote.customer?.document ? ` · ${escapeHtml(quote.customer.document)}` : ''}${quote.customer?.phone ? `<br>${escapeHtml(quote.customer.countryCode || '')} ${escapeHtml(quote.customer.phone)}` : ''}</div></div>`
  const descuento = Number(quote.discountPyg || 0)
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cotización ${escapeHtml(quote.number || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Cotización', `${quote.number || 'Cotización'} · ${quote.createdAt ? new Date(quote.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${empresaCard}
    ${contactoCliente}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(quote.subtotalPyg ?? quote.totalPyg))}</td></tr>
      ${descuento ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(descuento))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(quote.totalPyg))}</td></tr>
      <tr><td>Validez</td><td class="num">${escapeHtml(validez)}</td></tr>
    </table>
    <p><span class="tag">${escapeHtml(QUOTE_STATUS[quote.status] || quote.status || '')}</span></p>
    ${quote.notes ? `<p class="muted">${escapeHtml(quote.notes)}</p>` : ''}
    ${enlace ? `${qr ? `<img class="qr" src="${qr}" alt="QR de la cotización">` : ''}<p class="small">Aceptá o rechazá esta cotización: ${escapeHtml(enlace)}</p>` : ''}
    <footer>Documento no fiscal. Cotización generada por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
  return printHtml(html)
}

// Comprobante de reserva: entrega al cliente el IMEI apartado, la sucursal y
// el vencimiento para retirar o liberar.
export async function printReservationReceipt(reservation, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva</title><style>${styles(format)}</style></head><body>
    ${header('Comprobante de reserva', reservation.reservedUntil ? `Vence ${new Date(reservation.reservedUntil).toLocaleString('es-PY')}` : '', logo)}
    <div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(reservation.reservationCustomer || reservation.customerName || '—')}</strong></div></div>
    <table class="totals">
      <tr><td>Producto</td><td class="num">${escapeHtml(reservation.product?.name || reservation.productName || '—')}</td></tr>
      <tr><td>IMEI / serial</td><td class="num">${escapeHtml(reservation.serial || '—')}</td></tr>
      ${reservation.branch?.name ? `<tr><td>Sucursal</td><td class="num">${escapeHtml(reservation.branch.name)}</td></tr>` : ''}
      <tr><td>Vence</td><td class="num">${escapeHtml(reservation.reservedUntil ? new Date(reservation.reservedUntil).toLocaleString('es-PY') : '—')}</td></tr>
    </table>
    <p class="muted">La unidad queda apartada hasta la fecha indicada. Pasado el vencimiento se libera automáticamente.</p>
    ${footer()}
  </body></html>`
  return printHtml(html)
}


// Nota de entrega: respalda la entrega física de la mercadería con el receptor
// y su firma. Lista cantidades, no precios (el comprobante ya los detalla).
export async function buildDeliveryNoteHtml(order, { format = 'a4' } = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const when = order.createdAt || order.creadoEn || order.fecha
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null
  const logo = await getLogoDataUrl()
  const unidades = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || item.nombre || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)}</td></tr>`).join('')
  const empresaCard = `<div class="card"><div class="label">Entrega</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal.address, sucursal.city, sucursal.department].filter(Boolean).join(', '))}` : ''}${order.seller?.name ? `<br>Vendedor: ${escapeHtml(order.seller.name)}` : ''}</div></div>`
  const direccion = order.deliveryAddress ? [order.deliveryAddress.address, order.deliveryAddress.city, order.deliveryAddress.department].filter(Boolean).join(', ') : (cliente?.addresses?.[0] ? [cliente.addresses[0].address, cliente.addresses[0].city, cliente.addresses[0].department].filter(Boolean).join(', ') : '')
  const clienteCard = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente?.name || order.cliente || 'Consumidor final')}</strong>${cliente?.document ? ` · ${escapeHtml(cliente.document)}` : ''}${cliente?.phone ? `<br>${escapeHtml(`${cliente.countryCode || ''} ${cliente.phone}`.trim())}` : ''}${direccion ? `<br>${escapeHtml(direccion)}` : ''}</div></div>`
  const entregaNotas = order.deliveryType || order.deliveryNotes ? `<p class="muted">Entrega: ${escapeHtml(order.deliveryType || '—')}${order.deliveryNotes ? ` · ${escapeHtml(order.deliveryNotes)}` : ''}</p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nota de entrega ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Nota de entrega', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    ${empresaCard}
    ${clienteCard}
    <table><thead><tr><th>Producto</th><th class="num">Cantidad</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals"><tr><td>Total de unidades</td><td class="num">${escapeHtml(String(unidades))}</td></tr></table>
    ${entregaNotas}
    <p class="muted">Recibí conforme la mercadería detallada en este documento.</p>
    ${firmas([{ rol: 'Recibí conforme (firma)' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printDeliveryNote(order, options = {}) {
  const html = await buildDeliveryNoteHtml(order, options)
  return printHtml(html)
}

// Remisión interna: traslado entre sucursales con la firma de quien despacha y
// quien recibe. El remito ya lista los IMEI; acá se firma la entrega.
export async function buildRemisionHtml(transfer, { format = 'a4' } = {}) {
  const lines = Array.isArray(transfer.lines) ? transfer.lines : []
  const lineas = lines.map((line) => {
    const seriales = Array.isArray(line.serials) ? line.serials : []
    return `<div class="item"><strong>${escapeHtml(line.sourceProduct?.name || 'Producto')} × ${escapeHtml(line.quantity || 1)}</strong>${seriales.length ? `<div class="serials">${seriales.map((serial) => escapeHtml(serial)).join('<br>')}</div>` : ''}</div>`
  }).join('')
  const logo = await getLogoDataUrl()
  const empresa = transfer.tenant?.name || ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remisión interna</title><style>${styles(format)}
    .items{margin:10px 0;border-top:1px dashed #d5dbe0}.item{padding:8px 0;border-bottom:1px dashed #d5dbe0}.serials{font-size:9px;line-height:1.5;color:#333;margin-top:4px}
    @media print{.items,.item{border-color:#000}}
  </style></head><body>
    ${header('Remisión interna', `${transfer.sourceBranch?.name || 'Origen'} → ${transfer.destinationBranch?.name || 'Destino'} · ${transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    <div class="card"><div class="label">Datos</div><div>${escapeHtml(empresa || APP_NAME)}${transfer.createdBy?.name ? `<br>Despachado por: ${escapeHtml(transfer.createdBy.name)}` : ''}${transfer.destinationLocation?.name ? `<br>Destino en depósito: ${escapeHtml(transfer.destinationLocation.name)}` : ''}${transfer.aexGuide ? `<br>Guía AEX: ${escapeHtml(transfer.aexGuide)}` : ''}</div></div>
    <div class="items">${lineas}</div>
    ${transfer.notes ? `<p class="muted">${escapeHtml(transfer.notes)}</p>` : ''}
    <p class="muted">Controlá el contenido contra esta remisión al recibir.</p>
    ${firmas([{ rol: 'Entregué (despacho)' }, { rol: 'Recibí conforme (recepción)' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printRemisionReceipt(transfer, options = {}) {
  const html = await buildRemisionHtml(transfer, options)
  return printHtml(html)
}

// Recibo interno de un cobro puntual: monto, medio y referencia, con firmas.
export async function buildInternalReceiptHtml(payment = {}, order = {}, { format = 'a4' } = {}) {
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const when = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  const pedido = order?.orderNumber || order?.codigo || 'Pedido'
  const numero = payment.receiptNumber || payment.number || `${pedido}-${String(payment.id || '').slice(-4).toUpperCase() || 'R'}`
  const logo = await getLogoDataUrl()
  const empresa = order?.tenant?.name || order?.empresaNombre || ''
  const cliente = order?.customer?.name || order?.cliente || 'Consumidor final'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo interno ${escapeHtml(numero)}</title><style>${styles(format)}</style></head><body>
    ${header('Recibo interno', `N.º ${numero} · ${new Date(when).toLocaleString('es-PY')}`, logo)}
    ${avisoNoFiscal()}
    <div class="card"><div class="label">Recibí de</div><div><strong>${escapeHtml(cliente)}</strong><br>Concepto: cobro del pedido ${escapeHtml(pedido)}</div></div>
    <table class="totals">
      <tr><td>Medio</td><td class="num">${escapeHtml(metodo)}</td></tr>
      ${referencia ? `<tr><td>Cuenta / referencia</td><td class="num">${escapeHtml(referencia)}</td></tr>` : ''}
      ${payment.settlesAt ? `<tr><td>Acredita</td><td class="num">${escapeHtml(new Date(payment.settlesAt).toLocaleDateString('es-PY'))}</td></tr>` : ''}
      <tr><td>Monto cobrado</td><td class="num">${escapeHtml(gs(monto))}</td></tr>
    </table>
    ${firmas([{ rol: 'Entregué / cobré' }, { rol: 'Recibí conforme' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printInternalReceipt(payment, order, options = {}) {
  const html = await buildInternalReceiptHtml(payment, order, options)
  return printHtml(html)
}

// Proforma / presupuesto de una cotización: ítems, descuento, total y validez,
// sin el QR de aceptación (es un presupuesto impreso, no un enlace vivo).
export async function buildProformaHtml(quote, { format = 'a4' } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const logo = await getLogoDataUrl()
  const empresa = quote.tenant?.name || quote.companyName || ''
  const sucursal = quote.branch || null
  const cliente = quote.customer?.name || quote.customerName || 'Consumidor final'
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? 0)))}</td></tr>`).join('')
  const descuento = Number(quote.discountPyg || 0)
  const validez = quote.validUntil ? `Válida hasta el ${new Date(quote.validUntil).toLocaleDateString('es-PY')}` : 'Sin vencimiento'
  const empresaCard = `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${quote.seller?.name ? `<br>Vendedor: ${escapeHtml(quote.seller.name)}` : ''}</div></div>`
  const clienteCard = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente)}</strong>${quote.customer?.document ? ` · ${escapeHtml(quote.customer.document)}` : ''}${quote.customer?.phone ? `<br>${escapeHtml(`${quote.customer.countryCode || ''} ${quote.customer.phone}`.trim())}` : ''}</div></div>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Proforma ${escapeHtml(quote.number || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Factura proforma', `Presupuesto ${quote.number || ''} · ${quote.createdAt ? new Date(quote.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    ${empresaCard}
    ${clienteCard}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(quote.subtotalPyg ?? quote.totalPyg))}</td></tr>
      ${descuento ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(descuento))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(quote.totalPyg))}</td></tr>
      <tr><td>Validez</td><td class="num">${escapeHtml(validez)}</td></tr>
    </table>
    ${quote.notes ? `<p class="muted">${escapeHtml(quote.notes)}</p>` : ''}
    <p class="muted">Presupuesto sin validez fiscal: no reemplaza a la factura.</p>
    ${firmas([{ rol: 'Aceptación del cliente' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })}
    <footer>Documento no fiscal. Proforma generada por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printProformaReceipt(quote, options = {}) {
  const html = await buildProformaHtml(quote, options)
  return printHtml(html)
}

const hora = (valor) => (valor ? new Date(valor).toLocaleString('es-PY') : '—')

// Cierre de caja imprimible: apertura, movimientos de la sesión, cobros por
// medio de pago, esperado/contado/diferencia y firma. Los números llegan de
// `armarCierreCaja`, los mismos que muestra Caja.jsx.
export async function buildCierreCajaHtml(cierre = {}, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  const movimientos = Array.isArray(cierre.movimientos) ? cierre.movimientos : []
  const cobros = Array.isArray(cierre.cobros) ? cierre.cobros : []
  const cerrada = cierre.estado === 'CLOSED'
  const movimientosRows = movimientos.map((movimiento) => `<tr><td>${escapeHtml(movimiento.descripcion || 'Movimiento')}${movimiento.cuenta ? `<br><span class="muted">${escapeHtml(movimiento.cuenta)}</span>` : ''}</td><td class="num">${escapeHtml(hora(movimiento.fecha))}</td><td class="num">${movimiento.direccion === 'OUT' ? '−' : '+'} ${escapeHtml(gs(movimiento.montoPyg))}</td></tr>`).join('')
  const cobrosRows = cobros.map((cobro) => `<tr><td>${escapeHtml(cobro.label || cobro.method || 'Pago')}${cobro.count ? ` <span class="muted">· ${escapeHtml(String(cobro.count))} cobro(s)</span>` : ''}</td><td class="num">${escapeHtml(gs(cobro.montoPyg))}</td></tr>`).join('')
  const firma = firmas([{ rol: 'Responsable del arqueo' }, { rol: 'Control' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de caja</title><style>${styles(format)}</style></head><body>
    ${header('Cierre de caja', `Apertura ${hora(cierre.abiertoEn)}${cerrada ? ` · Cierre ${hora(cierre.cerradoEn)}` : ' · sesión abierta'}`, logo)}
    <div class="card"><div class="label">Sesión</div><div><strong>${escapeHtml(cierre.empresa || APP_NAME)}</strong>${cierre.sucursal ? `<br>${escapeHtml(cierre.sucursal)}` : ''}${cierre.usuario ? `<br>Generado por: ${escapeHtml(cierre.usuario)}` : ''}${cierre.notas ? `<br>Notas: ${escapeHtml(cierre.notas)}` : ''}</div></div>
    <table class="totals">
      <tr><td>Apertura</td><td class="num">${escapeHtml(gs(cierre.apertura))}</td></tr>
      <tr><td>Cobros${cierre.cobrosFecha ? ` (${escapeHtml(new Date(cierre.cobrosFecha).toLocaleDateString('es-PY'))})` : ''}</td><td class="num">${escapeHtml(gs(cierre.totalCobros))}</td></tr>
      ${cierre.ingresos ? `<tr><td>Movimientos (entradas)</td><td class="num">${escapeHtml(gs(cierre.ingresos))}</td></tr>` : ''}
      ${cierre.egresos ? `<tr><td>Movimientos (salidas)</td><td class="num">− ${escapeHtml(gs(cierre.egresos))}</td></tr>` : ''}
      <tr><td>Esperado</td><td class="num">${escapeHtml(gs(cierre.esperado))}</td></tr>
      <tr><td>Contado</td><td class="num">${cerrada ? escapeHtml(gs(cierre.contado)) : 'se completa al cerrar'}</td></tr>
      ${cerrada ? `<tr class="saldo"><td>Diferencia</td><td class="num">${escapeHtml(gs(cierre.diferencia))}</td></tr>` : ''}
    </table>
    <h2 style="font-size:13px;margin:14px 0 4px">Cobros por medio de pago</h2>
    <table><thead><tr><th>Medio</th><th class="num">Monto</th></tr></thead><tbody>${cobrosRows || '<tr><td class="muted">Sin cobros para el período.</td><td class="num"></td></tr>'}</tbody></table>
    <h2 style="font-size:13px;margin:14px 0 4px">Movimientos de la sesión (${movimientos.length})</h2>
    <table><thead><tr><th>Movimiento</th><th class="num">Fecha</th><th class="num">Monto</th></tr></thead><tbody>${movimientosRows || '<tr><td class="muted">Sin movimientos registrados.</td><td class="num"></td><td class="num"></td></tr>'}</tbody></table>
    ${firma}
    <footer>Documento de control interno. No es comprobante fiscal. Generado por ${escapeHtml(APP_NAME)}.</footer>
  </body></html>`
}

export async function printCierreCaja(cierre, options = {}) {
  return printHtml(await buildCierreCajaHtml(cierre, options))
}

// Resumen del día imprimible: ventas, ticket promedio, productos más vendidos,
// cobrado y pendiente del rango activo. Los números llegan de
// `armarResumenDia`, los mismos que muestra Resumen.jsx.
export async function buildResumenDiaHtml(resumen = {}, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  const top = Array.isArray(resumen.topProductos) ? resumen.topProductos : []
  const medios = Array.isArray(resumen.medios) ? resumen.medios : []
  const topRows = top.slice(0, 10).map((producto) => `<tr><td>${escapeHtml(producto.nombre || 'Producto')}</td><td class="num">${escapeHtml(String(producto.cantidad))}</td><td class="num">${escapeHtml(gs(producto.montoPyg))}</td></tr>`).join('')
  const mediosRows = medios.map((medio) => `<tr><td>${escapeHtml(medio.medio || '—')}</td><td class="num">${escapeHtml(gs(medio.monto))}</td></tr>`).join('')
  const etiqueta = resumen.etiqueta || `${new Date(resumen.rango?.desde || Date.now()).toLocaleDateString('es-PY')} a ${new Date(resumen.rango?.hasta || Date.now()).toLocaleDateString('es-PY')}`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen del día</title><style>${styles(format)}</style></head><body>
    ${header('Resumen del día', etiqueta, logo)}
    <table class="totals">
      <tr><td>Ventas</td><td class="num">${escapeHtml(String(resumen.ventas ?? 0))}</td></tr>
      <tr><td>Facturado</td><td class="num">${escapeHtml(gs(resumen.total))}</td></tr>
      <tr><td>Ticket promedio</td><td class="num">${escapeHtml(gs(resumen.ticket))}</td></tr>
      <tr><td>Cobrado</td><td class="num">${escapeHtml(gs(resumen.cobrado))}</td></tr>
      <tr class="saldo"><td>Pendiente</td><td class="num">${escapeHtml(gs(resumen.pendiente))}</td></tr>
      ${resumen.comision ? `<tr><td>Comisiones</td><td class="num">${escapeHtml(gs(resumen.comision))}</td></tr>` : ''}
      ${resumen.gastos ? `<tr><td>Gastos</td><td class="num">${escapeHtml(gs(resumen.gastos))}</td></tr>` : ''}
    </table>
    <h2 style="font-size:13px;margin:14px 0 4px">Productos más vendidos</h2>
    <table><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead><tbody>${topRows || '<tr><td class="muted">Sin ventas en el período.</td><td class="num"></td><td class="num"></td></tr>'}</tbody></table>
    <h2 style="font-size:13px;margin:14px 0 4px">Medios de pago</h2>
    <table><thead><tr><th>Medio</th><th class="num">Monto</th></tr></thead><tbody>${mediosRows || '<tr><td class="muted">Sin datos.</td><td class="num"></td></tr>'}</tbody></table>
    ${firmas([{ rol: 'Responsable' }, { rol: 'Control' }], { observaciones: true, estrecho: Boolean(thermalWidth(format)) })}
    <footer>Documento de control interno. No es comprobante fiscal. Generado por ${escapeHtml(APP_NAME)}.</footer>
  </body></html>`
}

export async function printResumenDia(resumen, options = {}) {
  return printHtml(await buildResumenDiaHtml(resumen, options))
}

// Informe de dispositivo imprimible (#240): equipo, verificación IMEI,
// inspección física, garantía y el QR al informe público. Usa los mismos
// estilos que el resto (`styles(format)`) para A4 y rollo, con los datos
// normalizados por `datosInformeDispositivo`.
export async function buildInformeDispositivoHtml(datos = {}, { format = 'a4' } = {}) {
  const inspeccion = datos.inspeccion || {}
  const garantia = estadoGarantia(datos)
  const logo = await getLogoDataUrl()
  let qr = ''
  try { if (datos.enlace) qr = await QRCode.toDataURL(datos.enlace, { errorCorrectionLevel: 'H', margin: 2, width: 320 }) } catch { /* el enlace queda impreso igual */ }
  const fila = (etiqueta, valor) => (valor ? `<div class="fila-informe"><span>${escapeHtml(etiqueta)}</span><span>${escapeHtml(valor)}</span></div>` : '')
  const verificacion = datos.verificacion
    ? `${fila('Estado', `${datos.verificacion.etiqueta || 'No verificado'}${datos.verificacion.simulado ? ' · simulada' : ''}`)}
       ${datos.verificacion.detalle ? `<p class="muted">${escapeHtml(datos.verificacion.detalle)}</p>` : ''}
       ${(datos.verificacion.campos || []).length ? `<div class="campos-informe">${datos.verificacion.campos.map((campo) => `<div class="fila-informe"><span>${escapeHtml(campo.etiqueta)}</span><span>${escapeHtml(campo.valor)}</span></div>`).join('')}</div>` : ''}
       <p class="small">Fuente ${escapeHtml(datos.verificacion.fuente || '')}${datos.verificacion.fechaTexto ? ` · ${escapeHtml(datos.verificacion.fechaTexto)}` : ''}</p>`
    : '<p class="muted">Sin consulta de IMEI registrada.</p>'
  const itemsChecklist = (inspeccion.items || []).filter((item) => item.estado)
  const tablaChecklist = (lista) => `<table class="checklist"><thead><tr><th>Ítem</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${lista.map((item) => `<tr><td>${escapeHtml(item.label || item.clave || '')}</td><td class="${['ok', 'na'].includes(String(item.estado)) ? 'ok' : 'no-ok'}">${escapeHtml(estadoChecklist(item.estado))}</td><td>${escapeHtml(item.nota || '')}</td></tr>`).join('')}</tbody></table>`
  // En A4 el checklist va en dos columnas: entra completo sin estirar el papel.
  const mitad = Math.ceil(itemsChecklist.length / 2)
  const tablas = format === 'a4' && itemsChecklist.length > 5
    ? `<div class="checklist-dos">${tablaChecklist(itemsChecklist.slice(0, mitad))}${tablaChecklist(itemsChecklist.slice(mitad))}</div>`
    : tablaChecklist(itemsChecklist)
  const itemsHtml = itemsChecklist.length
    ? `${tablas}
       ${inspeccion.nota ? `<p class="muted">Nota: ${escapeHtml(inspeccion.nota)}</p>` : ''}
       <p class="small">${escapeHtml(inspeccion.aviso || '')}</p>`
    : ''
  const inspeccionHtml = `
    ${fila('Verificado por', inspeccion.verificador)}
    ${fila('Verificado el', fechaVerificacionInforme(datos))}
    ${fila('Verificaciones', inspeccion.verificaciones ? String(inspeccion.verificaciones) : '')}
    ${fila('Grado', inspeccion.grado || 'Sin grado asignado')}
    ${fila('Puntaje', inspeccion.puntaje === null || inspeccion.puntaje === undefined ? '' : `${inspeccion.puntaje}/100`)}
    ${fila('Checklist', inspeccion.total ? `${inspeccion.aprobados}/${inspeccion.total} conformes` : '')}
    ${fila('Cosmético', inspeccion.cosmetico)}
    ${fila('Repuestos no OEM', inspeccion.repuestosNoOem)}
    ${itemsHtml}
    ${!itemsChecklist.length && !inspeccion.verificador && !inspeccion.grado ? '<p class="muted">Sin verificación física registrada.</p>' : ''}`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de dispositivo ${escapeHtml(datos.imei || datos.identificador || '')}</title><style>${styles(format)}
    .fila-informe{display:flex;justify-content:space-between;gap:10px;margin:2px 0}
    .fila-informe>span:first-child{color:#66707a}
    .campos-informe{margin-top:6px;border-top:1px dashed #d5dbe0;padding-top:6px}
    .checklist{margin:5px 0 2px}
    .checklist-dos{display:flex;gap:12px}.checklist-dos table{flex:1 1 0;min-width:0}
    .checklist th,.checklist td{border-bottom:1px dashed #d5dbe0;padding:2px 4px 2px 0;text-align:left;font-size:9px}
    .checklist th{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:#66707a}
    .checklist td:first-child{width:44%}
    .checklist td:last-child{width:40%;color:#66707a}
    .checklist .ok{color:#0a7a68;font-weight:700}
    .checklist .no-ok{color:#a33;font-weight:700}
    .card{page-break-inside:avoid}
    .qr{display:block;width:${format === 'a4' ? '24mm' : '28mm'};height:auto;margin:5px auto 2px}
    .qr-fila{display:flex;align-items:center;gap:10px}
    .qr-fila .qr{width:22mm;margin:0;flex:0 0 auto}
    .qr-fila .small{text-align:left;margin:0}
    ${format === 'a4' ? `@page{margin:12mm 14mm}.card{padding:7px 9px;margin:6px 0}.card .label{margin-bottom:2px}
      .nofiscal{margin:7px 0;padding:5px 8px;font-size:10px}.brand{padding-bottom:6px;margin-bottom:7px}
      h1{font-size:18px}body{font-size:11.5px;line-height:1.4}p{margin:3px 0}footer{margin-top:7px;padding-top:5px}` : ''}
    @media print{.fila-informe>span:first-child{color:#000}}
  </style></head><body>
    ${header('Informe de dispositivo', `${datos.sucursal || ''}${datos.sucursal ? ' · ' : ''}Emitido ${datos.fechaEmision || ''}`, logo)}
    <div class="nofiscal">Documento informativo · no válido como factura</div>
    <div class="card"><div class="label">Equipo</div><div><strong>${escapeHtml(datos.modelo || 'Producto')}</strong>${datos.sku ? ` · ${escapeHtml(datos.sku)}` : ''}
      ${fila('IMEI', datos.imei || '—')}
      ${fila('Serial', datos.serialImpreso)}
      ${fila('Condición', datos.condicion)}
      ${fila('Batería', datos.bateria)}
      ${fila('Ubicación', datos.ubicacion)}
      ${fila('Proveedor', datos.proveedor)}
    </div></div>
    <div class="card"><div class="label">Verificación IMEI</div>${verificacion}</div>
    ${format === 'a4' && datos.enlace ? `<div class="card"><div class="label">Informe público</div><div class="qr-fila">${qr ? `<img class="qr" src="${qr}" alt="QR del informe">` : ''}<p class="small">${escapeHtml(datos.enlacePublico ? datos.enlace : 'Escaneá para abrir el informe público.')}</p></div></div>` : ''}
    <div class="card"><div class="label">Inspección física</div>${inspeccionHtml}</div>
    <div class="card"><div class="label">Garantía de la tienda</div>${fila('Estado', garantia.etiqueta)}${fila('Vence el', garantia.hasta)}</div>
    ${format !== 'a4' && datos.enlace ? `<div class="card"><div class="label">Informe público</div>${qr ? `<img class="qr" src="${qr}" alt="QR del informe">` : ''}<p class="small">${escapeHtml(datos.enlacePublico ? datos.enlace : 'Escaneá para abrir el informe público.')}</p></div>` : ''}
    <footer>Documento informativo. Generado por ${escapeHtml(APP_NAME)}${datos.emisor ? ` para ${escapeHtml(datos.emisor)}` : ''} · ${escapeHtml(datos.fechaEmision || '')}</footer>
  </body></html>`
}

export async function printInformeDispositivo(datos, options = {}) {
  return printHtml(await buildInformeDispositivoHtml(datos, options))
}

// Certificado de inspección (#240): la constancia que se le da al comprador.
// Grado y puntaje del PhoneCheck (INV), semáforo de controles, checklist y el QR
// al informe público. Sin datos personales; el código `CERT|…` va en barras.
export async function buildCertificadoHtml(datos = {}, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  let qr = ''
  try { if (datos.enlace) qr = await QRCode.toDataURL(datos.enlace, { errorCorrectionLevel: 'H', margin: 2, width: 320 }) } catch { /* queda el enlace impreso */ }
  let barras = ''
  try {
    if (datos.codigoBarras && typeof document !== 'undefined') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svg, datos.codigoBarras, { format: 'CODE128', displayValue: false, margin: 0, height: 46, width: 1.4 })
      barras = `<div class="barcode">${svg.outerHTML}<span class="small">${escapeHtml(datos.codigo || '')}</span></div>`
    }
  } catch { /* sin barras el certificado conserva el QR y el código en texto */ }
  const fila = (etiqueta, valor) => (valor ? `<div class="fila-informe"><span>${escapeHtml(etiqueta)}</span><span>${escapeHtml(valor)}</span></div>` : '')
  const bateria = [
    datos.bateria?.porcentaje ? `${datos.bateria.porcentaje}%` : '',
    datos.bateria?.ciclos ? `${datos.bateria.ciclos} ciclos` : '',
  ].filter(Boolean).join(' · ')
  const items = (datos.items || []).filter((item) => item.estado)
  // En A4 el checklist va en dos columnas: con los 23 ítems de la UI de DSN
  // igual entra en una página.
  const tablaItems = (lista) => `<table class="checklist"><thead><tr><th>Ítem</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${lista.map((item) => `<tr><td>${escapeHtml(item.label || item.clave || '')}</td><td class="${['ok', 'na'].includes(String(item.estado)) ? 'ok' : 'no-ok'}">${escapeHtml(estadoChecklist(item.estado))}</td><td>${escapeHtml(item.nota || '')}</td></tr>`).join('')}</tbody></table>`
  const mitadItems = Math.ceil(items.length / 2)
  const tablaChecklist = format === 'a4' && items.length > 6
    ? `<div class="checklist-dos">${tablaItems(items.slice(0, mitadItems))}${tablaItems(items.slice(mitadItems))}</div>`
    : tablaItems(items)
  const controles = (datos.controles || []).map((control) => `<span class="control ${control.estado === 'sin-dato' ? 'sin-dato' : control.ok ? 'ok' : 'no-ok'}">${escapeHtml(control.label)} · ${control.estado === 'sin-dato' ? 'Sin dato' : control.ok ? 'OK' : 'FALLA'}${control.valor ? ` · ${escapeHtml(control.valor)}` : ''}</span>`).join(' ')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(datos.titulo || 'Certificado de inspección')} ${escapeHtml(datos.serialEnmascarado || '')}</title><style>${styles(format)}
    .fila-informe{display:flex;justify-content:space-between;gap:10px;margin:2px 0}
    .fila-informe>span:first-child{color:#66707a}
    .grado{text-align:center;margin:4px 0 0}
    .grado .letra{font-size:${format === 'a4' ? '36px' : '34px'};font-weight:900;line-height:1;letter-spacing:.04em}
    .grado .detalle{font-size:11px;color:#66707a;margin-top:2px}
    .control{display:inline-block;border:1px solid #0a7a68;border-radius:999px;padding:1px 7px;margin:2px 3px 0 0;font-size:10px;font-weight:700;color:#0a7a68}
    .control.no-ok{border-color:#a33;color:#a33}
    .control.sin-dato{border-color:#9aa4ad;color:#66707a}
    .checklist{margin:4px 0 0}
    .checklist-dos{display:flex;gap:12px}.checklist-dos table{flex:1 1 0;min-width:0}
    .checklist td,.checklist th{border-bottom:1px dashed #d5dbe0;padding:2px 4px 2px 0;text-align:left;font-size:9px}
    .checklist th{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:#66707a}
    .checklist td:first-child{width:44%}
    .checklist td:last-child{width:40%;color:#66707a}
    .checklist .ok{color:#0a7a68;font-weight:700}
    .checklist .no-ok{color:#a33;font-weight:700}
    .card{page-break-inside:avoid}
    .qr{display:block;width:24mm;height:auto;margin:5px auto 2px}
    .barcode{margin-top:2px}.barcode svg{width:100%;height:auto;max-height:12mm}
    ${format === 'a4' ? `@page{margin:12mm 14mm}.card{padding:7px 9px;margin:6px 0}.card .label{margin-bottom:2px}
      .nofiscal{margin:7px 0;padding:5px 8px;font-size:10px}.brand{padding-bottom:6px;margin-bottom:7px}
      h1{font-size:18px}body{font-size:11.5px;line-height:1.4}p{margin:3px 0}footer{margin-top:7px;padding-top:5px}` : ''}
    @media print{.fila-informe>span:first-child{color:#000}}
  </style></head><body>
    ${header(datos.titulo || 'Certificado de inspección', `${datos.sucursal || ''}${datos.sucursal ? ' · ' : ''}Emitido ${datos.fechaEmision || ''}`, logo)}
    <div class="nofiscal">Constancia de inspección · documento informativo</div>
    <div class="card grado"><div class="label">Grado</div><div class="letra">${escapeHtml(datos.grado || 'P')}</div>
      <div class="detalle">${datos.completa ? `Puntaje ${escapeHtml(String(datos.puntaje))}/100 · ${escapeHtml(String(datos.ok))}/${escapeHtml(String(datos.evaluados))} conformes` : 'Pendiente de inspección'}</div></div>
    <div class="card"><div class="label">Equipo</div><div><strong>${escapeHtml(datos.modelo || datos.producto || 'Producto')}</strong>
      ${fila('Serial', datos.serialImpreso || datos.serialEnmascarado)}
      ${fila('Condición', datos.condicion)}
      ${fila('Cosmético', datos.cosmetico)}
      ${fila('Batería', bateria)}
      ${fila('Ubicación', datos.ubicacion)}
      ${fila('Repuestos no OEM', datos.repuestosNoOem)}
    </div></div>
    ${datos.enlace || controles ? `<div class="card"><div class="label">Controles</div>${controles || '<p class="muted">Sin verificación IMEI registrada.</p>'}</div>` : ''}
    <div class="card"><div class="label">Checklist</div>
      ${items.length ? tablaChecklist : '<p class="muted">Pendiente de inspección.</p>'}
      ${datos.nota ? `<p class="muted">Nota: ${escapeHtml(datos.nota)}</p>` : ''}
      <p class="small">${escapeHtml(datos.aviso || '')}</p>
    </div>
    <div class="card"><div class="label">Verificación</div>
      ${fila('Verificado por', datos.verificadoPor)}
      ${fila('Verificado el', fechaHoraDocumento(datos.verificado))}
      ${fila('Fuente', datos.fuente?.proveedor ? `${datos.fuente.proveedor}${datos.fuente.fecha ? ` · ${fechaCortaDocumento(datos.fuente.fecha)}` : ''}` : '')}
    </div>
    ${datos.enlace ? `<div class="card"><div class="label">Informe público</div><div class="qr-fila">${qr ? `<img class="qr" src="${qr}" alt="QR del informe">` : ''}<p class="small">${escapeHtml(datos.enlacePublico ? datos.enlace : 'Escaneá para abrir el informe público.')}</p></div>${barras}</div>` : ''}
    <footer>Constancia de inspección. Generado por ${escapeHtml(APP_NAME)}${datos.emisor ? ` para ${escapeHtml(datos.emisor)}` : ''} · ${escapeHtml(datos.fechaEmision || '')}</footer>
  </body></html>`
}

export async function printCertificado(datos, options = {}) {
  return printHtml(await buildCertificadoHtml(datos, options))
}
