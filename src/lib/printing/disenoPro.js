// Impresión Pro: cómo un diseño de la galería llega al papel.
//
// - `cssDeDiseno` traduce los tamaños y la alineación de cada elemento del diseño
//   a las clases del comprobante premium (`.brand`, `.tipo`, `.num`, `.cuando`,
//   `.cols`, tablas, `.totals`, `.pie-doc`, `.qr`). El encabezado y el pie
//   estándar no se tocan: solo cambia su tamaño y alineación.
// - El diseño predeterminado de cada documento (cotización, remito y ticket) se
//   carga una vez por sesión y se aplica al HTML de esos documentos. Con el módulo
//   apagado no se aplica nada: se imprime el premium normal. Las plantillas
//   guardadas se conservan.
import { esDocumentoFlujo } from './perfiles.js'

export const DOCUMENTOS_CON_DISENO = ['cotizacion', 'remito', 'ticket']

const num = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0)
const elementoDe = (definition, binding) => (definition?.elements || []).find((e) => e.binding === binding && e.visible !== false)
const alinear = (e) => (e?.alignment === 'center' || e?.alignment === 'right' ? e.alignment : 'left')

/**
 * CSS del diseño sobre el HTML premium. `pagina: true` también fija ancho y
 * márgenes del papel (PDF de plantilla); sin eso respeta el papel del formato
 * elegido al imprimir (A4 o rollo).
 */
export function cssDeDiseno(definition, { pagina = false } = {}) {
  if (!definition?.elements) return ''
  const reglas = []
  const p = definition.page
  if (pagina && p) {
    const m = p.margins
    reglas.push(`@page{size:${p.widthMm}mm ${p.heightMm ? `${p.heightMm}mm` : 'auto'};margin:0}`)
    reglas.push(`html,body{width:${p.widthMm}mm!important;max-width:none!important;margin:0!important;min-height:0!important}`)
    reglas.push(`body{padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm!important;overflow-wrap:anywhere}`)
  }
  const marca = elementoDe(definition, 'brand')
  if (marca && alinear(marca) === 'center') reglas.push('.brand{display:block!important;text-align:center!important}.brand .emp,.brand .doc{text-align:center!important;justify-content:center!important;margin-left:auto;margin-right:auto}.brand .emp .logo{margin-left:auto;margin-right:auto}')
  const titulo = elementoDe(definition, 'documentTitle')
  if (titulo) reglas.push(`.brand .tipo{font-size:${num(titulo.fontSizePt)}pt!important;text-align:${alinear(titulo)}!important}`)
  const numero = elementoDe(definition, 'documentNumber')
  if (numero) reglas.push(`.brand .num{font-size:${num(numero.fontSizePt)}pt!important;text-align:${alinear(numero)}!important}`)
  const fecha = elementoDe(definition, 'date')
  if (fecha) reglas.push(`.brand .cuando{font-size:${num(fecha.fontSizePt)}pt!important;text-align:${alinear(fecha)}!important}`)
  const cliente = elementoDe(definition, 'customer')
  if (cliente) reglas.push(`.cols .card{font-size:${num(cliente.fontSizePt)}pt!important}`)
  const items = elementoDe(definition, 'items')
  if (items) reglas.push(`table{font-size:${num(items.fontSizePt)}pt!important}`)
  const pagos = elementoDe(definition, 'payments')
  if (pagos) reglas.push(`table.pagos{font-size:${num(pagos.fontSizePt)}pt!important}`)
  const total = elementoDe(definition, 'total')
  if (total) reglas.push(`.totals tr.total td{font-size:${num(total.fontSizePt)}pt!important}${alinear(total) === 'right' ? '.totals{margin-left:auto}' : ''}`)
  const garantia = elementoDe(definition, 'warranty') || elementoDe(definition, 'nonFiscal')
  if (garantia) reglas.push(`.pie-doc .condiciones{font-size:${num(garantia.fontSizePt)}pt!important;text-align:${alinear(elementoDe(definition, 'nonFiscal') || garantia)}!important}`)
  const qr = elementoDe(definition, 'qr')
  if (qr) reglas.push(`.qr{width:${num(qr.widthMm)}mm!important;height:${num(qr.widthMm)}mm!important}`)
  return reglas.join('')
}

/** Inserta el CSS del diseño al final del <head> del documento (o al principio si no hay). */
export function htmlConDiseno(html, definition, opciones) {
  const css = cssDeDiseno(definition, opciones)
  if (!css || typeof html !== 'string') return html
  const bloque = `<style data-diseno-pro>${css}</style>`
  return html.includes('</head>') ? html.replace('</head>', `${bloque}</head>`) : `${bloque}${html}`
}

// ── Diseño predeterminado de cada documento (cargado por sesión) ────────────────
let estado = { activo: false, disenos: {} }

/** Lo fija quien cargó el módulo y los predeterminados (ver `cargarDisenosPro`). */
export function fijarDisenosPro({ activo = false, disenos = {} } = {}) {
  estado = { activo: Boolean(activo), disenos: activo ? { ...disenos } : {} }
}
export const disenoPredeterminado = (kind) => (estado.activo ? estado.disenos[kind] || null : null)

/**
 * Aplica el diseño predeterminado al HTML de un documento. Con el módulo apagado,
 * sin predeterminado o para un documento que no admite diseño, devuelve el mismo
 * HTML: el premium normal.
 */
export function aplicarDisenoPredeterminado(kind, html) {
  if (!DOCUMENTOS_CON_DISENO.includes(kind) || !esDocumentoFlujo(kind)) return html
  const definition = disenoPredeterminado(kind)
  return definition ? htmlConDiseno(html, definition) : html
}

/**
 * Carga los predeterminados de los documentos con diseño. `lector` entrega
 * `{ activo, effective, templates }` (la sesión arma uno con el cliente de
 * plantillas); cualquier falla deja el premium normal.
 */
export async function cargarDisenosPro(lector) {
  try {
    const { activo, effective = {}, templates = [] } = await lector()
    if (!activo) { fijarDisenosPro({ activo: false }); return }
    const disenos = {}
    for (const kind of DOCUMENTOS_CON_DISENO) {
      const id = effective[kind]?.templateId
      const plantilla = id ? templates.find((t) => t.id === id && t.kind === kind) : null
      if (plantilla?.definition) disenos[kind] = plantilla.definition
    }
    fijarDisenosPro({ activo: true, disenos })
  } catch (error) {
    console.error('[impresion-pro] no se pudo cargar el diseño predeterminado:', error)
    fijarDisenosPro({ activo: false })
  }
}
