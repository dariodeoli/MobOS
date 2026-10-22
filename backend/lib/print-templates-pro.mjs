// Galería de diseños de Impresión Pro: 3 o 4 diseños por documento (comprobante,
// ticket, cotización, remito y etiquetas) como presets declarativos. Los comparten
// el servidor (valida y entrega los presets) y el front (galería y demo), igual
// que `imei-input.mjs`.
//
// Todos los diseños de documento (comprobante, ticket, cotización, remito) son
// "de flujo": el contenido lo arma el comprobante premium (encabezado con logo y
// datos de la empresa, tipo de documento, número grande, fecha; pie con la leyenda
// no fiscal, el QR y «Generado por …»). El diseño solo cambia papel, márgenes,
// tamaños y alineación; los datos obligatorios del encabezado y del pie no se
// pueden ocultar (los exige la validación del tipo).

const MARGEN = { top: 2, right: 2, bottom: 2, left: 2 }
const ancho = (papel) => papel - 4

// Apila los elementos de un documento de flujo (alto continuo): la posición vale
// para el editor y la vista; el contenido real lo acomoda el comprobante premium.
function flujo({ kind, name, widthMm, dpi = 203, equipo = 'generic', items }) {
  let y = 2
  const w = ancho(widthMm)
  const elements = items.map(([binding, opciones = {}]) => {
    const alto = opciones.h ?? 6
    const lado = binding === 'qr' ? (opciones.qr ?? 16) : null
    const element = {
      id: binding,
      binding,
      type: binding === 'qr' ? 'qr' : binding === 'brand' ? 'logo' : binding === 'items' ? 'block' : 'text',
      xMm: 2,
      yMm: y,
      widthMm: lado ?? w,
      heightMm: lado ?? alto,
      fontSizePt: opciones.fs ?? 8,
      alignment: opciones.al ?? 'left',
      rotation: 0,
      visible: true,
    }
    y += lado ?? alto
    return element
  })
  return {
    kind,
    name,
    definition: {
      schemaVersion: 1,
      page: { widthMm, heightMm: null, orientation: 0, margins: { ...MARGEN } },
      profile: { deviceFamily: equipo, output: 'document', dpi, printableWidthMm: w, offsetXmm: 2, offsetYmm: 0 },
      elements,
    },
  }
}

// Etiquetas: cajas posicionadas de verdad (mm). `piezas` = [binding, x, y, w, h, fs, al].
function etiqueta({ kind, name, widthMm, heightMm, piezas }) {
  return {
    kind,
    name,
    definition: {
      schemaVersion: 1,
      page: { widthMm, heightMm, orientation: 0, margins: { ...MARGEN } },
      profile: { deviceFamily: '3nstar-ltt214', output: 'document', dpi: 203, printableWidthMm: Math.min(widthMm - 2, 108), offsetXmm: 1, offsetYmm: 0 },
      elements: piezas.map(([binding, xMm, yMm, widthMmEl, heightMmEl, fontSizePt = 8, alignment = 'left']) => ({
        id: binding,
        binding,
        type: binding === 'qr' ? 'qr' : binding === 'barcode' ? 'barcode' : 'text',
        xMm,
        yMm,
        widthMm: widthMmEl,
        heightMm: heightMmEl,
        fontSizePt,
        alignment,
        rotation: 0,
        visible: true,
      })),
    },
  }
}

// Orden del documento de flujo: encabezado estándar (marca, tipo, número, fecha),
// cuerpo, y pie estándar (leyenda no fiscal + QR).
const COMPROBANTE = (c) => [['brand', c.brand], ['documentTitle', c.title], ['documentNumber', c.number], ['date', c.date], ['customer', c.customer], ['items', c.items], ['payments', c.payments], ['warranty', c.warranty], ['total', c.total], ['nonFiscal', c.nonFiscal], ['qr', c.qr]]
const TICKET = (c) => [['brand', c.brand], ['documentTitle', c.title], ['documentNumber', c.number], ['date', c.date], ['customer', c.customer], ['items', c.items], ['total', c.total], ['nonFiscal', c.nonFiscal], ['qr', c.qr]]
const COTIZACION = (c) => [['brand', c.brand], ['documentTitle', c.title], ['documentNumber', c.number], ['date', c.date], ['customer', c.customer], ['items', c.items], ['total', c.total], ['nonFiscal', c.nonFiscal], ['qr', c.qr]]
const REMITO = (c) => [['brand', c.brand], ['documentTitle', c.title], ['documentNumber', c.number], ['date', c.date], ['customer', c.customer], ['items', c.items], ['nonFiscal', c.nonFiscal], ['qr', c.qr]]

export const PRESETS_PRO = [
  // ── Comprobante (el premium actual sigue siendo el predeterminado) ──────────
  flujo({ kind: 'comprobante', name: 'Comprobante Compacto', widthMm: 58, items: COMPROBANTE({ brand: { h: 10, al: 'center' }, title: { al: 'center' }, number: { fs: 11, h: 7, al: 'center' }, date: { al: 'center' }, customer: { h: 8, fs: 7 }, items: { h: 30, fs: 7 }, payments: { h: 10, fs: 7 }, warranty: { h: 10, fs: 7 }, total: { fs: 11, h: 8 }, nonFiscal: { fs: 7 }, qr: { qr: 14 } }) }),
  flujo({ kind: 'comprobante', name: 'Comprobante Ejecutivo', widthMm: 80, items: COMPROBANTE({ brand: { h: 14, al: 'center' }, title: { al: 'center' }, number: { fs: 16, h: 10, al: 'center' }, date: { al: 'center' }, customer: { h: 10 }, items: { h: 34 }, payments: { h: 12 }, warranty: { h: 10 }, total: { fs: 14, h: 10, al: 'right' }, nonFiscal: { al: 'center' }, qr: { qr: 22 } }) }),
  flujo({ kind: 'comprobante', name: 'Comprobante Legible', widthMm: 80, items: COMPROBANTE({ brand: { h: 12 }, title: { fs: 10, h: 7 }, number: { fs: 14, h: 9 }, date: { fs: 10, h: 7 }, customer: { fs: 10, h: 12 }, items: { fs: 10, h: 36 }, payments: { fs: 10, h: 14 }, warranty: { fs: 10, h: 12 }, total: { fs: 16, h: 11, al: 'right' }, nonFiscal: { fs: 9, h: 7 }, qr: { qr: 24 } }) }),

  // ── Ticket (térmica 58/80) ─────────────────────────────────────────────────
  flujo({ kind: 'ticket', name: 'Ticket Clásico', widthMm: 80, items: TICKET({ brand: { h: 12 }, title: { al: 'center' }, number: { fs: 14, h: 8, al: 'center' }, date: { al: 'center' }, customer: { h: 8 }, items: { h: 30 }, total: { fs: 13, h: 9 }, nonFiscal: { al: 'center' }, qr: { qr: 20 } }) }),
  flujo({ kind: 'ticket', name: 'Ticket Compacto 58', widthMm: 58, items: TICKET({ brand: { h: 10, al: 'center' }, title: { al: 'center', fs: 7 }, number: { fs: 11, h: 7, al: 'center' }, date: { al: 'center', fs: 7 }, customer: { h: 8, fs: 7 }, items: { h: 26, fs: 7 }, total: { fs: 11, h: 8 }, nonFiscal: { al: 'center', fs: 7 }, qr: { qr: 14 } }) }),
  flujo({ kind: 'ticket', name: 'Ticket Grande', widthMm: 80, items: TICKET({ brand: { h: 14, al: 'center' }, title: { fs: 10, h: 7, al: 'center' }, number: { fs: 18, h: 11, al: 'center' }, date: { fs: 9, h: 7, al: 'center' }, customer: { fs: 9, h: 10 }, items: { fs: 9, h: 34 }, total: { fs: 16, h: 11, al: 'right' }, nonFiscal: { fs: 8, al: 'center' }, qr: { qr: 24 } }) }),

  // ── Cotización (A4) ─────────────────────────────────────────────────────────
  flujo({ kind: 'cotizacion', name: 'Cotización Formal', widthMm: 210, items: COTIZACION({ brand: { h: 16 }, title: { fs: 10, h: 8 }, number: { fs: 20, h: 12 }, date: { fs: 10, h: 7 }, customer: { fs: 10, h: 14 }, items: { fs: 10, h: 80 }, total: { fs: 16, h: 12, al: 'right' }, nonFiscal: { fs: 9, h: 8 }, qr: { qr: 28 } }) }),
  flujo({ kind: 'cotizacion', name: 'Cotización Centrada', widthMm: 210, items: COTIZACION({ brand: { h: 18, al: 'center' }, title: { fs: 11, h: 8, al: 'center' }, number: { fs: 22, h: 12, al: 'center' }, date: { fs: 10, h: 7, al: 'center' }, customer: { fs: 10, h: 14 }, items: { fs: 10, h: 80 }, total: { fs: 18, h: 12, al: 'right' }, nonFiscal: { fs: 9, h: 8, al: 'center' }, qr: { qr: 28 } }) }),
  flujo({ kind: 'cotizacion', name: 'Cotización Compacta', widthMm: 210, items: COTIZACION({ brand: { h: 12 }, title: { fs: 9, h: 6 }, number: { fs: 16, h: 9 }, date: { fs: 9, h: 6 }, customer: { fs: 9, h: 12 }, items: { fs: 9, h: 70 }, total: { fs: 13, h: 10, al: 'right' }, nonFiscal: { fs: 8, h: 7 }, qr: { qr: 22 } }) }),
  flujo({ kind: 'cotizacion', name: 'Cotización Destacada', widthMm: 210, items: COTIZACION({ brand: { h: 18 }, title: { fs: 12, h: 9 }, number: { fs: 26, h: 14 }, date: { fs: 11, h: 8 }, customer: { fs: 11, h: 16 }, items: { fs: 11, h: 80 }, total: { fs: 22, h: 14, al: 'right' }, nonFiscal: { fs: 9, h: 8 }, qr: { qr: 30 } }) }),

  // ── Remito (A4) ─────────────────────────────────────────────────────────────
  flujo({ kind: 'remito', name: 'Remito Clásico', widthMm: 210, items: REMITO({ brand: { h: 16 }, title: { fs: 10, h: 8 }, number: { fs: 20, h: 12 }, date: { fs: 10, h: 7 }, customer: { fs: 10, h: 14 }, items: { fs: 10, h: 90 }, nonFiscal: { fs: 9, h: 8 }, qr: { qr: 26 } }) }),
  flujo({ kind: 'remito', name: 'Remito Compacto', widthMm: 210, items: REMITO({ brand: { h: 12 }, title: { fs: 9, h: 6 }, number: { fs: 16, h: 9 }, date: { fs: 9, h: 6 }, customer: { fs: 9, h: 12 }, items: { fs: 9, h: 80 }, nonFiscal: { fs: 8, h: 7 }, qr: { qr: 20 } }) }),
  flujo({ kind: 'remito', name: 'Remito Centrado', widthMm: 210, items: REMITO({ brand: { h: 18, al: 'center' }, title: { fs: 11, h: 8, al: 'center' }, number: { fs: 22, h: 12, al: 'center' }, date: { fs: 10, h: 7, al: 'center' }, customer: { fs: 10, h: 14 }, items: { fs: 10, h: 90 }, nonFiscal: { fs: 9, h: 8, al: 'center' }, qr: { qr: 26 } }) }),

  // ── Etiquetas de producto ───────────────────────────────────────────────────
  etiqueta({ kind: 'etiquetas-producto', name: 'Producto Precio Grande', widthMm: 110, heightMm: 60, piezas: [['product', 2, 2, 106, 10, 10], ['price', 2, 12, 106, 14, 22, 'center'], ['sku', 2, 26, 106, 6, 8], ['barcode', 2, 32, 106, 18]] }),
  etiqueta({ kind: 'etiquetas-producto', name: 'Producto con QR', widthMm: 110, heightMm: 60, piezas: [['qr', 2, 2, 22, 22], ['product', 26, 2, 82, 12, 10], ['price', 26, 14, 82, 10, 14], ['sku', 2, 26, 106, 6, 8], ['barcode', 2, 32, 106, 18]] }),
  etiqueta({ kind: 'etiquetas-producto', name: 'Producto Compacta', widthMm: 60, heightMm: 40, piezas: [['product', 2, 2, 56, 8, 8], ['price', 2, 10, 56, 8, 11, 'center'], ['sku', 2, 18, 56, 5, 7], ['barcode', 2, 23, 56, 13]] }),

  // ── Etiquetas de unidad ─────────────────────────────────────────────────────
  etiqueta({ kind: 'etiquetas-stock', name: 'Unidad con QR Grande', widthMm: 110, heightMm: 60, piezas: [['qr', 2, 2, 24, 24], ['model', 28, 2, 80, 12, 10], ['serial', 28, 14, 80, 8, 9], ['barcode', 2, 30, 106, 18]] }),
  etiqueta({ kind: 'etiquetas-stock', name: 'Unidad con Estado', widthMm: 110, heightMm: 60, piezas: [['model', 2, 2, 70, 10, 10], ['condition', 74, 2, 34, 6, 8, 'right'], ['battery', 74, 8, 34, 6, 8, 'right'], ['serial', 2, 14, 106, 7, 9], ['qr', 2, 22, 20, 20], ['location', 24, 22, 50, 6, 8], ['supplierCode', 76, 22, 32, 6, 8, 'right'], ['barcode', 2, 43, 106, 15]] }),
  etiqueta({ kind: 'etiquetas-stock', name: 'Unidad Compacta', widthMm: 60, heightMm: 40, piezas: [['model', 2, 2, 56, 8, 8], ['serial', 2, 10, 56, 6, 7], ['qr', 2, 17, 14, 14], ['barcode', 18, 17, 40, 14]] }),
]
