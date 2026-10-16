import { erroresPerfil } from './perfiles.js'
import { solapesElementos } from './geometria.js'
export const TIPOS_PLANTILLA = {
  comprobante: 'Comprobante premium',
  'etiquetas-producto': 'Etiquetas de producto',
  'etiquetas-stock': 'Etiquetas de unidad',
}
export const OBLIGATORIOS = {
  comprobante: [
    'brand',
    'documentTitle',
    'documentNumber',
    'items',
    'total',
    'nonFiscal',
    'qr',
    'customer',
    'payments',
    'warranty',
    'date',
  ],
  'etiquetas-producto': ['product', 'sku', 'barcode'],
  'etiquetas-stock': ['model', 'serial', 'qr', 'barcode'],
}
export const OPCIONALES = {
  comprobante: [],
  'etiquetas-producto': ['price', 'brand', 'qr'],
  'etiquetas-stock': ['brand', 'condition', 'battery', 'location', 'supplierCode'],
}
export const CONTENIDOS = {
  brand: 'Empresa',
  documentTitle: 'Tipo de documento',
  documentNumber: 'Número',
  items: 'Artículos (flujo protegido)',
  total: 'Total',
  nonFiscal: 'Leyenda no fiscal',
  qr: 'Código QR',
  product: 'Producto',
  sku: 'SKU',
  barcode: 'Código de barras',
  price: 'Precio de venta',
  model: 'Modelo',
  serial: 'IMEI / serial completo',
  customer: 'Cliente',
  payments: 'Pagos',
  warranty: 'Garantía',
  date: 'Fecha',
  condition: 'Condición',
  battery: 'Batería',
  location: 'Ubicación',
  supplierCode: 'Sigla del proveedor',
}
export const tipoElemento = binding =>
  binding === 'qr'
    ? 'qr'
    : binding === 'barcode'
      ? 'barcode'
      : binding === 'brand'
        ? 'logo'
        : binding === 'items'
          ? 'block'
          : 'text'
export const clonarPlantilla = value => JSON.parse(JSON.stringify(value))
export const nombrePlantillaValido = value =>
  typeof value === 'string' && /^[\p{L}\p{N} _().×+\-]{1,80}$/u.test(value.trim())
const exacto = (value, keys) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(k => keys.includes(k)),
  )
const numero = (n, min, max) =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  n >= min &&
  n <= max &&
  Math.abs(n * 100 - Math.round(n * 100)) < 0.000001
export function erroresPlantilla(kind, d) {
  if (
    !OBLIGATORIOS[kind] ||
    !exacto(d, ['schemaVersion', 'page', 'profile', 'elements']) ||
    d.schemaVersion !== 1
  )
    return ['Tipo o versión de plantilla no admitidos.']
  const p = d.page,
    m = p?.margins,
    errors = []
  if (
    !exacto(p, ['widthMm', 'heightMm', 'orientation', 'margins']) ||
    !numero(p.widthMm, 5, 216) ||
    !((p.heightMm === null && kind === 'comprobante') || numero(p.heightMm, 10, 2000)) ||
    ![0, 90].includes(p.orientation)
  )
    return ['Medidas u orientación no válidas.']
  if (
    !exacto(m, ['top', 'right', 'bottom', 'left']) ||
    !['top', 'right', 'bottom', 'left'].every(k => numero(m[k], 0, 40)) ||
    m.left + m.right >= p.widthMm ||
    (p.heightMm !== null && m.top + m.bottom >= p.heightMm)
  )
    return ['Los márgenes no dejan área útil.']
  if (
    !exacto(d.profile, [
      'deviceFamily',
      'output',
      'dpi',
      'printableWidthMm',
      'offsetXmm',
      'offsetYmm',
    ])
  )
    return ['Perfil no válido.']
  errors.push(...erroresPerfil(p, d.profile))
  if (
    ![d.profile.printableWidthMm, d.profile.offsetXmm, d.profile.offsetYmm].every(n =>
      numero(n, 0, 2000),
    )
  )
    errors.push('El perfil admite hasta dos decimales.')
  if (!Array.isArray(d.elements) || !d.elements.length || d.elements.length > 40)
    return [...errors, 'Se requieren de 1 a 40 elementos.']
  const ids = new Set(),
    bindings = new Set()
  for (const e of d.elements) {
    if (
      !exacto(e, [
        'id',
        'binding',
        'type',
        'xMm',
        'yMm',
        'widthMm',
        'heightMm',
        'fontSizePt',
        'alignment',
        'rotation',
        'visible',
      ]) ||
      typeof e.id !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(e.id) ||
      ids.has(e.id) ||
      bindings.has(e.binding)
    ) {
      errors.push('Elemento inválido o repetido.')
      continue
    }
    ids.add(e.id)
    bindings.add(e.binding)
    if (
      ![...OBLIGATORIOS[kind], ...OPCIONALES[kind]].includes(e.binding) ||
      e.type !== tipoElemento(e.binding)
    )
      errors.push('Contenido o tipo de elemento no permitido.')
    if (typeof e.visible !== 'boolean' || (OBLIGATORIOS[kind].includes(e.binding) && !e.visible))
      errors.push('Los datos obligatorios no se pueden ocultar.')
    if (
      !numero(e.xMm, 0, p.widthMm) ||
      !numero(e.yMm, 0, p.heightMm ?? 2000) ||
      !numero(e.widthMm, 1, p.widthMm) ||
      !numero(e.heightMm, 1, p.heightMm ?? 2000) ||
      !numero(e.fontSizePt, 6, 48) ||
      !['left', 'center', 'right'].includes(e.alignment) ||
      ![0, 90, 180, 270].includes(e.rotation)
    ) {
      errors.push(`Medidas no válidas: ${CONTENIDOS[e.binding] || e.id}.`)
      continue
    }
    if (
      e.xMm < Math.max(m.left, d.profile.offsetXmm) ||
      e.xMm + e.widthMm >
        Math.min(p.widthMm - m.right, d.profile.offsetXmm + d.profile.printableWidthMm) ||
      e.yMm < Math.max(m.top, d.profile.offsetYmm) ||
      (p.heightMm !== null && e.yMm + e.heightMm > p.heightMm - m.bottom)
    )
      errors.push(`Fuera del área útil: ${CONTENIDOS[e.binding] || e.id}.`)
    if (
      (e.type === 'qr' && (e.widthMm < 10 || e.heightMm !== e.widthMm)) ||
      (e.type === 'barcode' && (e.widthMm < 15 || e.heightMm < 5))
    )
      errors.push('El QR o código de barras es demasiado pequeño.')
  }
  if (OBLIGATORIOS[kind].some(b => !bindings.has(b)))
    errors.push('Faltan datos obligatorios del documento.')
  errors.push(...solapesElementos(d.elements))
  return [...new Set(errors)]
}
export const PRESETS_PLANTILLA = [
  {
    kind: 'comprobante',
    name: 'Comprobante premium',
    definition: {
      schemaVersion: 1,
      page: {
        widthMm: 80,
        heightMm: null,
        orientation: 0,
        margins: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      profile: {
        deviceFamily: 'generic',
        output: 'document',
        dpi: 203,
        printableWidthMm: 76,
        offsetXmm: 2,
        offsetYmm: 0,
      },
      elements: [
        {
          id: 'brand',
          binding: 'brand',
          type: 'logo',
          xMm: 2,
          yMm: 2,
          widthMm: 76,
          heightMm: 12,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'documentTitle',
          binding: 'documentTitle',
          type: 'text',
          xMm: 2,
          yMm: 14,
          widthMm: 76,
          heightMm: 6,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'documentNumber',
          binding: 'documentNumber',
          type: 'text',
          xMm: 2,
          yMm: 20,
          widthMm: 76,
          heightMm: 8,
          fontSizePt: 12,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'date',
          binding: 'date',
          type: 'text',
          xMm: 2,
          yMm: 28,
          widthMm: 76,
          heightMm: 6,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'customer',
          binding: 'customer',
          type: 'text',
          xMm: 2,
          yMm: 34,
          widthMm: 76,
          heightMm: 10,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'items',
          binding: 'items',
          type: 'block',
          xMm: 2,
          yMm: 44,
          widthMm: 76,
          heightMm: 30,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'payments',
          binding: 'payments',
          type: 'text',
          xMm: 2,
          yMm: 74,
          widthMm: 76,
          heightMm: 12,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'warranty',
          binding: 'warranty',
          type: 'text',
          xMm: 2,
          yMm: 86,
          widthMm: 76,
          heightMm: 10,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'total',
          binding: 'total',
          type: 'text',
          xMm: 2,
          yMm: 96,
          widthMm: 76,
          heightMm: 10,
          fontSizePt: 12,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'nonFiscal',
          binding: 'nonFiscal',
          type: 'text',
          xMm: 2,
          yMm: 106,
          widthMm: 76,
          heightMm: 6,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'qr',
          binding: 'qr',
          type: 'qr',
          xMm: 2,
          yMm: 112,
          widthMm: 16,
          heightMm: 16,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
      ],
    },
  },
  {
    kind: 'etiquetas-producto',
    name: 'Producto horizontal',
    definition: {
      schemaVersion: 1,
      page: {
        widthMm: 110,
        heightMm: 60,
        orientation: 0,
        margins: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      profile: {
        deviceFamily: '3nstar-ltt214',
        output: 'document',
        dpi: 203,
        printableWidthMm: 108,
        offsetXmm: 1,
        offsetYmm: 0,
      },
      elements: [
        {
          id: 'product',
          binding: 'product',
          type: 'text',
          xMm: 2,
          yMm: 2,
          widthMm: 106,
          heightMm: 12,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'price',
          binding: 'price',
          type: 'text',
          xMm: 2,
          yMm: 14,
          widthMm: 106,
          heightMm: 8,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'sku',
          binding: 'sku',
          type: 'text',
          xMm: 2,
          yMm: 22,
          widthMm: 106,
          heightMm: 6,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'barcode',
          binding: 'barcode',
          type: 'barcode',
          xMm: 2,
          yMm: 28,
          widthMm: 106,
          heightMm: 14,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
      ],
    },
  },
  {
    kind: 'etiquetas-stock',
    name: 'Unidad horizontal',
    definition: {
      schemaVersion: 1,
      page: {
        widthMm: 110,
        heightMm: 60,
        orientation: 0,
        margins: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      profile: {
        deviceFamily: '3nstar-ltt214',
        output: 'document',
        dpi: 203,
        printableWidthMm: 108,
        offsetXmm: 1,
        offsetYmm: 0,
      },
      elements: [
        {
          id: 'model',
          binding: 'model',
          type: 'text',
          xMm: 2,
          yMm: 2,
          widthMm: 106,
          heightMm: 12,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'serial',
          binding: 'serial',
          type: 'text',
          xMm: 2,
          yMm: 14,
          widthMm: 106,
          heightMm: 6,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'qr',
          binding: 'qr',
          type: 'qr',
          xMm: 2,
          yMm: 20,
          widthMm: 16,
          heightMm: 16,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
        {
          id: 'barcode',
          binding: 'barcode',
          type: 'barcode',
          xMm: 2,
          yMm: 36,
          widthMm: 106,
          heightMm: 14,
          fontSizePt: 8,
          alignment: 'left',
          rotation: 0,
          visible: true,
        },
      ],
    },
  },
]
