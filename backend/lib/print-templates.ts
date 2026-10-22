import presets from './print-templates-presets.json'
import { PRESETS_PRO } from './print-templates-pro.mjs'
import { InputError } from './payment-input'

export const PRINT_TEMPLATE_KINDS = ['comprobante', 'etiquetas-producto', 'etiquetas-stock', 'ticket', 'cotizacion', 'remito'] as const
export type PrintTemplateKind = typeof PRINT_TEMPLATE_KINDS[number]
// Documentos de flujo: el contenido lo arma el comprobante premium (encabezado y
// pie estándar), el diseño solo cambia papel, márgenes, tamaños y alineación; el
// alto es continuo (null).
export const FLOW_KINDS: readonly PrintTemplateKind[] = ['comprobante', 'ticket', 'cotizacion', 'remito']
const HEADER_FOOTER = ['brand', 'documentTitle', 'documentNumber', 'date', 'nonFiscal', 'qr']
const REQUIRED: Record<PrintTemplateKind, string[]> = {
  comprobante: ['brand', 'documentTitle', 'documentNumber', 'items', 'total', 'nonFiscal', 'qr', 'customer', 'payments', 'warranty', 'date'],
  'etiquetas-producto': ['product', 'sku', 'barcode'],
  'etiquetas-stock': ['model', 'serial', 'qr', 'barcode'],
  ticket: [...HEADER_FOOTER, 'items', 'total'],
  cotizacion: [...HEADER_FOOTER, 'customer', 'items', 'total'],
  remito: [...HEADER_FOOTER, 'customer', 'items'],
}
const OPTIONAL: Record<PrintTemplateKind, string[]> = {
  comprobante: [],
  'etiquetas-producto': ['price', 'brand', 'qr'],
  'etiquetas-stock': ['brand', 'condition', 'battery', 'location', 'supplierCode'],
  ticket: ['customer', 'payments', 'warranty'],
  cotizacion: [],
  remito: ['total'],
}
type Obj = Record<string, unknown>
const fail = (message: string): never => { throw new InputError(message) }
function object(value: unknown, keys: string[], label: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label}: objeto requerido.`)
  const obj = value as Obj
  if (Object.keys(obj).some(key => !keys.includes(key))) return fail(`${label}: campo no permitido.`)
  return obj
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return fail(`${label}: número válido con hasta dos decimales requerido.`)
  return value
}
function choice<T extends string | number>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) return fail(`${label}: opción inválida.`)
  return value as T
}
export function templateKind(value: unknown): PrintTemplateKind { return choice(value, PRINT_TEMPLATE_KINDS, 'Tipo') }
export function templateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) return fail('Revisión requerida.')
  return Number(value)
}
export function templateName(value: unknown): string {
  if (typeof value !== 'string' || !/^[\p{L}\p{N} _().×+\-]{1,80}$/u.test(value.trim())) return fail('Nombre: hasta 80 letras, números o separadores simples.')
  return value.trim()
}
export function templateDefinition(kind: PrintTemplateKind, value: unknown) {
  const root = object(value, ['schemaVersion', 'page', 'profile', 'elements'], 'Plantilla')
  if (root.schemaVersion !== 1) return fail('Versión de plantilla no admitida.')
  const page = object(root.page, ['widthMm', 'heightMm', 'orientation', 'margins'], 'Página')
  const widthMm = number(page.widthMm, 5, 216, 'Ancho')
  const heightMm = page.heightMm === null && FLOW_KINDS.includes(kind) ? null : number(page.heightMm, 10, 2000, 'Alto')
  const orientation = choice(page.orientation, [0, 90], 'Orientación')
  const margins = object(page.margins, ['top', 'right', 'bottom', 'left'], 'Márgenes')
  const normalizedMargins = { top: number(margins.top, 0, 40, 'Margen superior'), right: number(margins.right, 0, 40, 'Margen derecho'), bottom: number(margins.bottom, 0, 40, 'Margen inferior'), left: number(margins.left, 0, 40, 'Margen izquierdo') }
  if (normalizedMargins.left + normalizedMargins.right >= widthMm || (heightMm !== null && normalizedMargins.top + normalizedMargins.bottom >= heightMm)) return fail('Los márgenes no dejan área útil.')
  const profile = object(root.profile, ['deviceFamily', 'output', 'dpi', 'printableWidthMm', 'offsetXmm', 'offsetYmm'], 'Perfil')
  const deviceFamily = choice(profile.deviceFamily, ['generic', 'brother-ql800', '3nstar-ltt214', 'zkp8008', 'star-tsp143iiiw'], 'Equipo')
  const output = choice(profile.output, ['document', 'escpos', 'brother-raster', 'tspl', 'star-graphics'], 'Salida')
  const allowed: Record<string, string[]> = { generic: ['document'], 'brother-ql800': ['document', 'brother-raster'], '3nstar-ltt214': ['document', 'tspl'], zkp8008: ['document', 'escpos'], 'star-tsp143iiiw': ['document', 'star-graphics'] }
  if (!allowed[deviceFamily].includes(output)) return fail('Salida incompatible con el equipo. Guardar no acredita impresión física.')
  const dpi = choice(profile.dpi, [203, 300, 600], 'DPI')
  if ((deviceFamily === 'brother-ql800' && dpi !== 300) || (['3nstar-ltt214', 'star-tsp143iiiw'].includes(deviceFamily) && dpi !== 203)) return fail('DPI incompatible con el equipo.')
  const printableWidthMm = number(profile.printableWidthMm, 5, widthMm, 'Ancho imprimible')
  const offsetXmm = number(profile.offsetXmm, 0, widthMm, 'Desplazamiento X')
  const offsetYmm = number(profile.offsetYmm, 0, heightMm ?? 2000, 'Desplazamiento Y')
  if (offsetXmm + printableWidthMm > widthMm || (deviceFamily === 'brother-ql800' && (widthMm < 12 || widthMm > 62 || printableWidthMm > 58 || (heightMm !== null && heightMm > 1000))) || (deviceFamily === '3nstar-ltt214' && (widthMm < 25.4 || widthMm > 115 || printableWidthMm > 108 || (heightMm !== null && heightMm > 1778))) || (['zkp8008', 'star-tsp143iiiw'].includes(deviceFamily) && ![58, 80].includes(widthMm))) return fail('El medio excede el área admitida por el equipo.')
  if (!Array.isArray(root.elements) || root.elements.length < 1 || root.elements.length > 40) return fail('Se requieren entre 1 y 40 elementos.')
  const ids = new Set<string>(); const bindings = new Set<string>()
  const elements = root.elements.map(value => {
    const e = object(value, ['id', 'binding', 'type', 'xMm', 'yMm', 'widthMm', 'heightMm', 'fontSizePt', 'alignment', 'rotation', 'visible'], 'Elemento')
    if (typeof e.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(e.id) || ids.has(e.id)) return fail('Identificador de elemento inválido o repetido.')
    ids.add(e.id)
    const binding = choice(e.binding, [...REQUIRED[kind], ...OPTIONAL[kind]], 'Contenido')
    if (bindings.has(binding)) return fail('Contenido repetido.')
    bindings.add(binding)
    const type = choice(e.type, ['text', 'block', 'logo', 'qr', 'barcode'], 'Elemento')
    const expected = binding === 'qr' ? 'qr' : binding === 'barcode' ? 'barcode' : binding === 'brand' ? 'logo' : binding === 'items' ? 'block' : 'text'
    if (type !== expected) return fail('Tipo de elemento incompatible con su contenido.')
    if (typeof e.visible !== 'boolean' || (REQUIRED[kind].includes(binding) && !e.visible)) return fail('Los datos obligatorios deben permanecer visibles.')
    const xMm = number(e.xMm, 0, widthMm, 'X'); const yMm = number(e.yMm, 0, heightMm ?? 2000, 'Y')
    const ew = number(e.widthMm, 1, widthMm, 'Ancho del elemento'); const eh = number(e.heightMm, 1, heightMm ?? 2000, 'Alto del elemento')
    const fontSizePt = number(e.fontSizePt, 6, 48, 'Tipografía')
    const alignment = choice(e.alignment, ['left', 'center', 'right'], 'Alineación')
    const rotation = choice(e.rotation, [0, 90, 180, 270], 'Rotación')
    // width/height describe the final physical bounding box, including rotation.
    if (xMm < Math.max(normalizedMargins.left, offsetXmm) || xMm + ew > Math.min(widthMm - normalizedMargins.right, offsetXmm + printableWidthMm) || yMm < Math.max(normalizedMargins.top, offsetYmm) || (heightMm !== null && yMm + eh > heightMm - normalizedMargins.bottom)) return fail('Elemento fuera del área imprimible.')
    if ((type === 'qr' && (ew < 10 || eh < 10 || ew !== eh)) || (type === 'barcode' && (ew < 15 || eh < 5))) return fail('Código demasiado pequeño o geometría inválida.')
    return { id: e.id, binding, type, xMm, yMm, widthMm: ew, heightMm: eh, fontSizePt, alignment, rotation, visible: e.visible }
  })
  const visible = elements.filter(e => e.visible)
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j]
    if (a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm && a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm) return fail('Elementos visibles superpuestos.')
  }
  if (REQUIRED[kind].some(binding => !bindings.has(binding))) return fail('Faltan datos obligatorios del documento.')
  return { schemaVersion: 1, page: { widthMm, heightMm, orientation, margins: normalizedMargins }, profile: { deviceFamily, output, dpi, printableWidthMm, offsetXmm, offsetYmm }, elements }
}
export function builtinTemplates() {
  return presets.map(preset => ({ ...preset, definition: templateDefinition(templateKind(preset.kind), preset.definition) }))
}
/** Galería de Impresión Pro: 3 o 4 diseños por documento, todos validados como cualquier plantilla. */
export function proTemplates() {
  return PRESETS_PRO.map(preset => ({ ...preset, pro: true, definition: templateDefinition(templateKind(preset.kind), preset.definition) }))
}
/** Todo lo que se ofrece al crear una plantilla: lo incorporado y los diseños pro. */
export function allBuiltinTemplates() { return [...builtinTemplates(), ...proTemplates()] }
export function templateInput(value: unknown, partial = false) {
  return object(value, partial ? ['revision', 'name', 'definition'] : ['kind', 'name', 'definition'], 'Datos')
}
