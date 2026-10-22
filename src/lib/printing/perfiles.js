// Documentos de flujo: los arma el comprobante premium (encabezado y pie
// estándar); el diseño solo cambia papel, márgenes, tamaños y alineación.
export const DOCUMENTOS_FLUJO = ['comprobante', 'ticket', 'cotizacion', 'remito']
export const esDocumentoFlujo = kind => DOCUMENTOS_FLUJO.includes(kind)
export const PERFILES_IMPRESION = [
  {
    id: 'generic',
    nombre: 'Documento / PDF manual',
    salidas: ['document'],
    dpi: 203,
    widthMm: 110,
    heightMm: 60,
    printableWidthMm: 106,
    offsetXmm: 2,
    offsetYmm: 0,
  },
  {
    id: 'brother-ql800',
    nombre: 'Brother QL-800 · provisional 25 × 90 mm',
    salidas: ['document', 'brother-raster'],
    dpi: 300,
    widthMm: 25,
    heightMm: 90,
    printableWidthMm: 21,
    offsetXmm: 2,
    offsetYmm: 0,
  },
  {
    id: '3nstar-ltt214',
    nombre: '3nStar LTT214 · provisional 110 × 60 mm',
    salidas: ['document', 'tspl'],
    dpi: 203,
    widthMm: 110,
    heightMm: 60,
    printableWidthMm: 108,
    offsetXmm: 0,
    offsetYmm: 0,
  },
  {
    id: 'zkp8008',
    nombre: 'ZKP8008 · rollo',
    salidas: ['document', 'escpos'],
    dpi: 203,
    widthMm: 80,
    heightMm: null,
    printableWidthMm: 76,
    offsetXmm: 2,
    offsetYmm: 0,
  },
  {
    id: 'star-tsp143iiiw',
    nombre: 'Star TSP143IIIW · documento / Graphics',
    salidas: ['document', 'star-graphics'],
    dpi: 203,
    widthMm: 80,
    heightMm: null,
    printableWidthMm: 76,
    offsetXmm: 2,
    offsetYmm: 0,
  },
]
export function erroresPerfil(page, p) {
  const errors = [],
    model = PERFILES_IMPRESION.find(m => m.id === p?.deviceFamily)
  if (!model || !model.salidas.includes(p?.output))
    errors.push('Salida incompatible con el equipo.')
  if (
    ![203, 300, 600].includes(p?.dpi) ||
    (model?.id === 'brother-ql800' && p.dpi !== 300) ||
    (['3nstar-ltt214', 'star-tsp143iiiw'].includes(model?.id) && p.dpi !== 203)
  )
    errors.push('DPI incompatible con el equipo.')
  if (
    ![p?.printableWidthMm, p?.offsetXmm, p?.offsetYmm].every(Number.isFinite) ||
    p.printableWidthMm < 5 ||
    p.offsetXmm < 0 ||
    p.offsetYmm < 0 ||
    p.offsetXmm + p.printableWidthMm > page.widthMm
  )
    errors.push('Ancho útil o desplazamientos fuera del papel.')
  if (
    model?.id === 'brother-ql800' &&
    (page.widthMm < 12 ||
      page.widthMm > 62 ||
      p.printableWidthMm > 58 ||
      (page.heightMm !== null && page.heightMm > 1000))
  )
    errors.push('El medio excede la Brother QL-800.')
  if (
    model?.id === '3nstar-ltt214' &&
    (page.widthMm < 25.4 ||
      page.widthMm > 115 ||
      p.printableWidthMm > 108 ||
      (page.heightMm !== null && page.heightMm > 1778))
  )
    errors.push('La LTT214 admite ancho útil máximo de 108 mm.')
  if (['zkp8008', 'star-tsp143iiiw'].includes(model?.id) && ![58, 80].includes(page.widthMm))
    errors.push('El equipo requiere papel de 58 u 80 mm.')
  return errors
}
export const avisoSalidaPlantilla = () =>
  'Impresión directa pendiente de compatibilidad y calibración (#506). Descargá el PDF y elegí manualmente el equipo y el tamaño; no se envía ningún trabajo al agente.'

// Propuesta editable para medios provisionales. No es calibración física.
export function aplicarPerfilPlantilla(definition, id, kind) {
  const model = PERFILES_IMPRESION.find(p => p.id === id)
  if (!model) return definition
  const width = model.widthMm,
    height = esDocumentoFlujo(kind) ? model.heightMm : model.heightMm || 90
  const page = {
    widthMm: width,
    heightMm: height,
    orientation: 0,
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
  }
  const profile = {
    deviceFamily: id,
    output: 'document',
    dpi: model.dpi,
    printableWidthMm: model.printableWidthMm,
    offsetXmm: model.offsetXmm,
    offsetYmm: 0,
  }
  if (esDocumentoFlujo(kind)) return { ...definition, page, profile }
  const inner = Math.min(width - 4, model.printableWidthMm),
    visible = definition.elements.filter(e => e.visible)
  const small = id === 'brother-ql800'
  let y = 2
  const elements = visible.map(e => {
    const h = small
      ? e.binding === 'barcode'
        ? kind === 'etiquetas-stock'
          ? 52
          : 58
        : e.binding === 'qr'
          ? 16
          : e.binding === 'serial'
            ? 6
            : e.binding === 'sku'
              ? 8
              : e.binding === 'price'
                ? 6
                : kind === 'etiquetas-stock'
                  ? 12
                  : 14
      : e.heightMm
    const next = {
      ...e,
      xMm: 2,
      yMm: y,
      widthMm: e.type === 'qr' ? 16 : inner,
      heightMm: h,
      rotation: small && e.type === 'barcode' ? 90 : 0,
    }
    y += h
    return next
  })
  return {
    ...definition,
    page,
    profile,
    elements: [...elements, ...definition.elements.filter(e => !e.visible)],
  }
}
