// Parser del pegado de llegada de mercadería (#408, unidad C). Puro: sin base ni
// red. Entiende la planilla de Dario: bloques por fecha («12/10/2026»,
// «07/10/2026 · VOS PEDÍS») y una fila por equipo (modelo con variante, IMEI o
// serie, sigla del proveedor, costo y nota). El catálogo entra por una función
// inyectada y nunca se crea un producto: sin coincidencia es un error, con
// varias hay que elegir. Todo hallazgo queda en `issues` de la fila.

export type ArrivalCondition = 'NEW' | 'USED' | 'REFURBISHED'
export type ArrivalSerialKind = 'IMEI' | 'SERIE' | 'NINGUNO'
export type ArrivalDestination = 'STOCK' | 'OTRA_SUCURSAL' | 'DEVOLVER' | 'FALTA_IMEI' | 'TECNICO'

export type ArrivalIssue = {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export type ModelSpec = {
  // Lo que queda del texto del modelo sin capacidad, color, región ni condición.
  modelName: string
  capacity: string | null
  ram: string | null
  color: string | null
  region: string | null
  modelCode: string | null
  condition: ArrivalCondition
  conditionExplicit: boolean
  batteryPct: number | null
  batteryCycles: number | null
  // YYYY-MM-DD (último día del mes indicado).
  warrantyUntil: string | null
}

export type NoteHints = {
  orderNumber: string | null
  customerHint: string | null
  sendToBranchHint: string | null
  sendToOtherBranch: boolean
  returnToSupplier: boolean
  missingImei: boolean
  notArrived: boolean
  technician: boolean
  // Texto de la nota que no se interpretó (p. ej. «TUPI»).
  rest: string
}

export type CatalogMatch =
  | { kind: 'one'; productId: string }
  | { kind: 'many'; productIds: string[] }
  | { kind: 'none' }

export type ProductMatcher = (spec: ModelSpec) => CatalogMatch

export type ParseSupplier = { id: string; code: string }

export type ParseOptions = {
  currency: 'USD' | 'PYG'
  suppliers: ParseSupplier[]
  matchProduct: ProductMatcher
}

export type ParsedRow = {
  rowIndex: number
  line: number
  blockDate: string | null
  blockLabel: string | null
  raw: { cells: string[]; line: number }
  modelText: string
  spec: ModelSpec
  condition: ArrivalCondition
  productId: string | null
  productCandidates: string[]
  serial: string | null
  serialKind: ArrivalSerialKind
  supplierCode: string | null
  supplierId: string | null
  originalCost: number | null
  currency: 'USD' | 'PYG'
  note: string | null
  hints: NoteHints
  destination: ArrivalDestination
  declaredNoLlego: boolean
  issues: ArrivalIssue[]
}

export type ParsedBlock = { date: string | null; label: string | null; line: number; rows: number; error: string | null }

export type ParseResult = {
  rows: ParsedRow[]
  blocks: ParsedBlock[]
  errorCount: number
  warningCount: number
}

// ---------------------------------------------------------------- utilidades

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘´`]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

const SCIENTIFIC = /^\d([.,]\d+)?E\+?\d+$/i

export function isScientificNotation(cell: string): boolean {
  return SCIENTIFIC.test(cell.replace(/\s+/g, ''))
}

const MONTHS: Record<string, number> = {
  ENERO: 1, ENE: 1, FEBRERO: 2, FEB: 2, MARZO: 3, MAR: 3, ABRIL: 4, ABR: 4, MAYO: 5, MAY: 5, JUNIO: 6, JUN: 6,
  JULIO: 7, JUL: 7, AGOSTO: 8, AGO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, SEPT: 9, SEP: 9, OCTUBRE: 10, OCT: 10,
  NOVIEMBRE: 11, NOV: 11, DICIEMBRE: 12, DIC: 12,
}

// Colores ES/EN → nombre canónico (en español). Los compuestos van primero.
const COLORS: Array<[string, string]> = [
  ['SPACE GRAY', 'GRIS ESPACIAL'], ['SPACE GREY', 'GRIS ESPACIAL'], ['GRIS ESPACIAL', 'GRIS ESPACIAL'],
  ['SPACE BLACK', 'NEGRO ESPACIAL'], ['NEGRO ESPACIAL', 'NEGRO ESPACIAL'],
  ['COSMIC ORANGE', 'NARANJA'], ['DEEP BLUE', 'AZUL PROFUNDO'], ['AZUL PROFUNDO', 'AZUL PROFUNDO'],
  ['NATURAL TITANIUM', 'TITANIO NATURAL'], ['TITANIO NATURAL', 'TITANIO NATURAL'],
  ['DESERT TITANIUM', 'TITANIO DESIERTO'], ['TITANIO DESIERTO', 'TITANIO DESIERTO'],
  ['SKY BLUE', 'CELESTE'], ['MIDNIGHT', 'MEDIANOCHE'], ['STARLIGHT', 'LUZ ESTELAR'],
  ['NEGRO', 'NEGRO'], ['BLACK', 'NEGRO'], ['BLANCO', 'BLANCO'], ['WHITE', 'BLANCO'],
  ['AZUL', 'AZUL'], ['BLUE', 'AZUL'], ['ROJO', 'ROJO'], ['RED', 'ROJO'], ['VERDE', 'VERDE'], ['GREEN', 'VERDE'],
  ['DORADO', 'DORADO'], ['GOLD', 'DORADO'], ['PLATA', 'PLATA'], ['SILVER', 'PLATA'],
  ['GRIS', 'GRIS'], ['GRAY', 'GRIS'], ['GREY', 'GRIS'], ['NARANJA', 'NARANJA'], ['ORANGE', 'NARANJA'],
  ['ROSA', 'ROSA'], ['ROSADO', 'ROSA'], ['PINK', 'ROSA'], ['MORADO', 'MORADO'], ['PURPLE', 'MORADO'], ['VIOLETA', 'MORADO'],
  ['AMARILLO', 'AMARILLO'], ['YELLOW', 'AMARILLO'], ['CELESTE', 'CELESTE'], ['TITANIO', 'TITANIO'], ['TITANIUM', 'TITANIO'],
]

const BRAND_TOKENS = new Set(['IPHONE', 'APPLE', 'SAMSUNG', 'GALAXY', 'XIAOMI', 'MOTOROLA'])

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0))
  return d.toISOString().slice(0, 10)
}

// ------------------------------------------------------------- modelo y variante

// «GARANTIA MAYO 2027» → 2027-05-31 (último día del mes). Devuelve el texto sin
// la garantía; un mes ilegible avisa y no inventa la fecha.
function extractWarranty(input: string): { warrantyUntil: string | null; warning: ArrivalIssue | null; rest: string } {
  const text = normalizeText(input)
  const m = /\b(?:GARANTIA|GTIA)\s+(?:HASTA\s+)?([A-Z]+)\.?\s+(?:DE\s+)?(\d{4})\b/.exec(text)
  if (!m) return { warrantyUntil: null, warning: null, rest: text }
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
  const month = MONTHS[m[1]]
  if (month) return { warrantyUntil: lastDayOfMonth(Number(m[2]), month), warning: null, rest }
  return { warrantyUntil: null, warning: { code: 'GARANTIA_ILEGIBLE', severity: 'warning', message: `Garantía con mes no reconocido («${m[1]}»)` }, rest }
}

export function extractModelSpec(input: string): ModelSpec & { warnings: ArrivalIssue[] } {
  let text = ` ${normalizeText(input)} `
  const warnings: ArrivalIssue[] = []
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text)
    if (m) text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`
    return m
  }

  const w = extractWarranty(text)
  text = ` ${w.rest} `
  const warrantyUntil = w.warrantyUntil
  if (w.warning) warnings.push(w.warning)

  let batteryCycles: number | null = null
  const cycles = take(/\b(\d{1,4})\s*CICLOS?\b/)
  if (cycles) batteryCycles = Number(cycles[1])

  let batteryPct: number | null = null
  const battery = take(/\b(\d{1,3})\s*%/)
  if (battery) {
    const pct = Number(battery[1])
    if (pct >= 1 && pct <= 100) batteryPct = pct
    else warnings.push({ code: 'BATERIA_INVALIDA', severity: 'warning', message: `Batería fuera de rango (${battery[1]}%)` })
  }

  let capacity: string | null = null
  let ram: string | null = null
  const cap = take(/\b(?:(\d{1,2})\s*\/\s*)?(\d{1,4})\s*(GB|TB)\b/)
  if (cap) {
    capacity = `${cap[2]}${cap[3]}`
    if (cap[1]) ram = `${cap[1]}GB`
  }

  let modelCode: string | null = null
  const code = take(/\b(A\d{4})\b/)
  if (code) modelCode = code[1]

  let region: string | null = null
  const reg = take(/\b(LL|HN|JP)(?:\/A)?\b/)
  if (reg) region = reg[1]
  take(/\bA\/A\b/) // notación de región de la planilla sin significado propio

  let explicit: ArrivalCondition | null = null
  const cond = take(/\b(SEMI\s*NUEVOS?|SEMI|USADOS?|USADAS?|NUEVOS?|SELLADOS?|SEALED|NEW|REACONDICIONADOS?|REFURBISHED)\b/)
  if (cond) {
    const word = cond[1]
    explicit = /^(SEMI|USAD)/.test(word) ? 'USED' : /^(REAC|REFU)/.test(word) ? 'REFURBISHED' : 'NEW'
  }

  let color: string | null = null
  for (const [word, canonical] of COLORS) {
    if (take(new RegExp(`\\b${escapeRe(word)}\\b`))) { color = canonical; break }
  }

  const modelName = text
    .replace(/['"”]/g, '')
    .replace(/[|/,;·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Condición: la palabra explícita manda; si no, la batería delata un equipo
  // usado salvo «100% / 0 CICLOS» (equipo nuevo que solo muestra su batería).
  let condition: ArrivalCondition = 'NEW'
  if (explicit) condition = explicit
  else if (batteryPct !== null && !(batteryPct === 100 && batteryCycles === 0)) condition = 'USED'
  else if (batteryCycles !== null && batteryCycles > 0) condition = 'USED'

  return { modelName, capacity, ram, color, region, modelCode, condition, conditionExplicit: explicit !== null, batteryPct, batteryCycles, warrantyUntil, warnings }
}

// ----------------------------------------------------------------------- notas

const KEYWORD_CELL = /^(SE DEVUELVE|DEVOLVER|DEVOLUCION|CARGAR IMEI|MANDAR CDE|CDE|NO LLEGO|NO INGRESO|NO LLEGARON|NO INGRESARON|TECNICO|TALLER|PEDIDO|RESERVADO)\b/

export function parseNote(note: string): NoteHints {
  let text = ` ${normalizeText(note)} `
  const strip = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text)
    if (m) text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`
    return m
  }
  const hints: NoteHints = {
    orderNumber: null, customerHint: null, sendToBranchHint: null, sendToOtherBranch: false,
    returnToSupplier: false, missingImei: false, notArrived: false, technician: false, rest: '',
  }
  const order = strip(/#\s*(\d+)/)
  if (order) hints.orderNumber = order[1]
  if (strip(/\bNO\s+(?:LLEGO|LLEGARON|INGRESO|INGRESARON|VINO|VINIERON)\b/)) hints.notArrived = true
  if (strip(/\b(?:SE\s+DEVUELVE|DEVOLVER|DEVOLUCION)\b/)) hints.returnToSupplier = true
  if (strip(/\bCARGAR\s+IMEI\b/)) hints.missingImei = true
  if (strip(/\b(?:SE\s+MANDA\s+A\s+|MANDAR\s+|ENVIAR\s+A\s+|SE\s+ENVIA\s+A\s+)?CDE\b/)) { hints.sendToOtherBranch = true; hints.sendToBranchHint = 'CDE' }
  if (strip(/\b(?:TECNICO|TECNICA|TALLER)\b/)) hints.technician = true
  const customer = strip(/\b(?:PEDIDO|RESERVADO|RESERVADA)\s+(?:DE\s+|PARA\s+)?([A-Z0-9][A-Z0-9 .'-]*)/)
  if (customer) {
    hints.customerHint = customer[1].replace(/\s+/g, ' ').trim()
  }
  hints.rest = text.replace(/[|;,·]+/g, ' ').replace(/\s+/g, ' ').trim()
  return hints
}

// ------------------------------------------------------------ separadores y celdas

const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(.*)$/

function splitLine(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : null
  const cells = separator ? line.split(separator) : [line]
  return cells.map(cell => cell.trim().replace(/^"(.*)"$/, '$1').trim())
}

function isBlank(cells: string[]): boolean {
  return cells.every(cell => cell === '' || /^[-=_*·.\s—–]+$/.test(cell))
}

function parseDateRow(cells: string[]): { date: string | null; label: string | null; error: string | null } | null {
  const first = cells.find(cell => cell !== '')
  if (!first) return null
  const match = DATE_RE.exec(first)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  const labelParts = [match[4].replace(/^[\s·\-–—:|]+/, '').trim(), ...cells.slice(cells.indexOf(first) + 1).filter(cell => cell !== '')]
  const label = labelParts.filter(Boolean).join(' ').trim() || null
  const dt = new Date(Date.UTC(year, month - 1, day))
  const valid = dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  if (!valid) return { date: null, label, error: `Fecha inválida («${first}»)` }
  return { date: dt.toISOString().slice(0, 10), label, error: null }
}

const COST_RE = /^(?:(USD|US\$|U\$S|\$)\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/i

type CostCell = { amount: number; explicitUsd: boolean }

function parseCost(cell: string, allowLong: boolean): CostCell | null {
  const clean = cell.replace(/\s+/g, ' ').trim()
  const m = COST_RE.exec(clean)
  if (!m) return null
  const thousands = /^\d{1,3}(?:\.\d{3})+$/.test(m[2]) && m[3] === undefined
  const intPart = m[2].replace(/\./g, '')
  const explicitUsd = Boolean(m[1] && m[1].toUpperCase() !== '$') || false
  if (!allowLong && intPart.length > 7 && !m[1]) return null
  if (intPart.length > 12) return null
  const amount = Number(`${intPart}${m[3] && !thousands ? `.${m[3]}` : ''}`)
  return Number.isFinite(amount) ? { amount, explicitUsd } : null
}

type SerialClass =
  | { kind: 'sci' }
  | { kind: 'imei'; value: string; problems: ArrivalIssue[] }
  | { kind: 'serie'; value: string }

function classifySerial(cell: string): SerialClass | null {
  const compact = cell.replace(/\s+/g, '')
  if (compact === '') return null
  if (isScientificNotation(compact)) return { kind: 'sci' }
  const digits = compact.replace(/-/g, '')
  if (/^\d{15}$/.test(digits)) {
    const problems: ArrivalIssue[] = []
    if (/0{3,}$/.test(digits)) problems.push({ code: 'IMEI_EXCEL', severity: 'error', message: 'IMEI perdido por Excel, corregir (termina en ceros)' })
    else if (!luhnValid(digits)) problems.push({ code: 'IMEI_INVALIDO', severity: 'error', message: `IMEI inválido (no pasa Luhn): ${digits}` })
    return { kind: 'imei', value: digits, problems }
  }
  const upper = compact.toUpperCase()
  if (/^[A-Z0-9]{8,14}$/.test(upper) && /\d/.test(upper) && !cell.includes(' ')) return { kind: 'serie', value: upper }
  if (/^\d{16,}$/.test(digits)) return { kind: 'sci' } // demasiado largo: casi seguro mal pegado
  return null
}

function isSupplierShape(cell: string): boolean {
  const n = normalizeText(cell)
  return /^[A-Z]{2,5}$/.test(n) && !KEYWORD_CELL.test(n)
}

// ----------------------------------------------------------------- parser

export function parseArrivalPaste(text: string, options: ParseOptions): ParseResult {
  const suppliers = new Map(options.suppliers.map(s => [normalizeText(s.code), s]))
  const rows: ParsedRow[] = []
  const blocks: ParsedBlock[] = []
  let block: ParsedBlock | null = null
  let rowIndex = 0

  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((rawLine, lineNo) => {
    const cells = splitLine(rawLine)
    if (isBlank(cells)) return
    const dateRow = parseDateRow(cells)
    if (dateRow) {
      block = { date: dateRow.date, label: dateRow.label, line: lineNo + 1, rows: 0, error: dateRow.error }
      blocks.push(block)
      return
    }
    const nonEmpty = cells.filter(cell => cell !== '')
    if (/^(MODELO|EQUIPO|PRODUCTO|DESCRIPCION)$/.test(normalizeText(nonEmpty[0]))) return // encabezado
    const [modelCell, ...restCells] = nonEmpty
    const issues: ArrivalIssue[] = []
    const { warnings: specWarnings, ...spec } = extractModelSpec(modelCell)
    issues.push(...specWarnings)

    // Clasificar el resto de las celdas.
    const cellInfo = restCells.map((cell, index) => ({ cell, index, used: false }))
    const supplierKnown = (cell: string) => suppliers.has(normalizeText(cell))
    const prevOf = (index: number) => (index > 0 ? cellInfo[index - 1] : null)

    // Costo: primera celda numérica corta (o larga si sigue a un proveedor conocido y el lote es en PYG).
    let cost: CostCell | null = null
    let costIdx = -1
    for (const info of cellInfo) {
      const prev = prevOf(info.index)
      const afterSupplier = options.currency === 'PYG' && prev && supplierKnown(prev.cell)
      const parsed = parseCost(info.cell, Boolean(afterSupplier))
      if (!parsed) continue
      if (classifySerial(info.cell) && !afterSupplier) continue
      cost = parsed; costIdx = info.index; info.used = true
      break
    }

    // Serie / IMEI: primera celda que lo parezca (no el costo).
    let serial: string | null = null
    let serialKind: ArrivalSerialKind = 'NINGUNO'
    let serialIdx = -1
    for (const info of cellInfo) {
      if (info.used) continue
      const cls = classifySerial(info.cell)
      if (!cls) continue
      info.used = true
      serialIdx = info.index
      if (cls.kind === 'sci') {
        issues.push({ code: 'IMEI_EXCEL', severity: 'error', message: `IMEI perdido por Excel, corregir («${info.cell}»)` })
      } else if (cls.kind === 'imei') {
        serial = cls.value; serialKind = 'IMEI'; issues.push(...cls.problems)
      } else {
        serial = cls.value; serialKind = 'SERIE'
      }
      break
    }

    // Proveedor: la celda justo antes del costo si tiene forma de sigla; si no, una sigla conocida.
    let supplierCode: string | null = null
    const before = costIdx > 0 ? cellInfo[costIdx - 1] : null
    if (before && !before.used && isSupplierShape(before.cell)) { supplierCode = normalizeText(before.cell); before.used = true }
    else {
      const known = cellInfo.find(info => !info.used && supplierKnown(info.cell))
      if (known) { supplierCode = normalizeText(known.cell); known.used = true }
    }
    const supplier = supplierCode ? suppliers.get(supplierCode) ?? null : null
    if (!supplierCode) issues.push({ code: 'PROVEEDOR_FALTA', severity: 'error', message: 'Falta la sigla del proveedor' })
    else if (!supplier) issues.push({ code: 'PROVEEDOR_DESCONOCIDO', severity: 'error', message: `Proveedor desconocido («${supplierCode}»): crealo antes en Proveedores` })

    // Costo y moneda del lote.
    if (cost && cost.explicitUsd && options.currency !== 'USD') {
      issues.push({ code: 'MONEDA_DISTINTA', severity: 'error', message: 'El costo está en USD pero el lote es en guaraníes' })
    }
    if (!cost) issues.push({ code: 'COSTO_FALTA', severity: 'warning', message: 'Falta el costo' })

    // Notas: lo que no se usó.
    let noteText = cellInfo.filter(info => !info.used).map(info => info.cell).join(' · ')
    // La garantía puede venir en su propia celda («GARANTIA MAYO 2027»).
    if (!spec.warrantyUntil) {
      const inNote = extractWarranty(noteText)
      if (inNote.warrantyUntil || inNote.warning) {
        spec.warrantyUntil = inNote.warrantyUntil
        if (inNote.warning) issues.push(inNote.warning)
        noteText = inNote.rest
      }
    }
    const hints = parseNote(noteText)

    let destination: ArrivalDestination = 'STOCK'
    if (hints.notArrived) destination = 'STOCK'
    else if (hints.returnToSupplier) destination = 'DEVOLVER'
    else if (hints.sendToOtherBranch) destination = 'OTRA_SUCURSAL'
    else if (hints.technician) destination = 'TECNICO'
    else if (hints.missingImei || serialKind === 'NINGUNO') destination = 'FALTA_IMEI'
    if (serialKind === 'NINGUNO' && serialIdx < 0 && !hints.notArrived && !hints.returnToSupplier) {
      issues.push({ code: 'FALTA_IMEI', severity: 'warning', message: 'Sin IMEI/serie: ingresa bloqueada hasta cargarlo' })
    }

    // Catálogo (inyectado): nunca se crea un producto.
    let productId: string | null = null
    let productCandidates: string[] = []
    const found = options.matchProduct(spec)
    if (found.kind === 'one') { productId = found.productId; productCandidates = [found.productId] }
    else if (found.kind === 'many') {
      productCandidates = found.productIds
      issues.push({ code: 'ELEGIR_PRODUCTO', severity: 'error', message: `Hay ${found.productIds.length} productos posibles: elegí uno` })
    } else {
      issues.push({ code: 'PRODUCTO_NO_ENCONTRADO', severity: 'error', message: `No hay un producto para «${modelCell}»: crealo en el catálogo` })
    }

    rowIndex += 1
    const open = block as ParsedBlock | null
    if (open) open.rows += 1
    rows.push({
      rowIndex, line: lineNo + 1, blockDate: open?.date ?? null, blockLabel: open?.label ?? null,
      raw: { cells: nonEmpty, line: lineNo + 1 }, modelText: modelCell,
      spec, condition: spec.condition,
      productId, productCandidates, serial, serialKind,
      supplierCode, supplierId: supplier?.id ?? null,
      originalCost: cost ? cost.amount : null, currency: options.currency,
      note: noteText || null, hints, destination, declaredNoLlego: hints.notArrived, issues,
    })
  })

  // Duplicados dentro del pegado.
  const bySerial = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    if (!row.serial) continue
    const key = row.serial.toUpperCase()
    bySerial.set(key, [...(bySerial.get(key) ?? []), row])
  }
  for (const [serial, group] of bySerial) {
    if (group.length < 2) continue
    const where = group.map(row => `fila ${row.rowIndex}`).join(', ')
    for (const row of group) row.issues.push({ code: 'DUPLICADO_EN_LOTE', severity: 'error', message: `IMEI/serie repetido en el pegado (${serial}: ${where})` })
  }

  let errorCount = 0
  let warningCount = 0
  for (const row of rows) for (const issue of row.issues) issue.severity === 'error' ? errorCount++ : warningCount++
  for (const b of blocks) if (b.error) errorCount++
  return { rows, blocks, errorCount, warningCount }
}

// ------------------------------------------------------ matcher de catálogo básico

export type CatalogProduct = { id: string; name: string; model?: string | null; color?: string | null; capacity?: string | null }

function modelTokens(value: string): string[] {
  return normalizeText(value).replace(/['"”]/g, '').split(/[^A-Z0-9]+/).filter(token => token && !BRAND_TOKENS.has(token))
}

// Compara el modelo (sin marca) por igualdad exacta de palabras para que «15»
// no coincida con «15 Pro»; capacidad y color deben coincidir si ambos lados los
// traen. Varios candidatos → «elegir»; ninguno → error en el parser.
export function createCatalogMatcher(catalog: CatalogProduct[]): ProductMatcher {
  const prepared = catalog.map(product => {
    const fromName = extractModelSpec(product.name)
    const nameTokens = modelTokens(product.model ? product.model : fromName.modelName)
    const capacity = product.capacity ? extractModelSpec(product.capacity).capacity ?? normalizeText(product.capacity) : fromName.capacity
    const color = product.color ? extractModelSpec(product.color).color ?? normalizeText(product.color) : fromName.color
    return { id: product.id, tokens: nameTokens.slice().sort().join(' '), capacity, color }
  })
  return spec => {
    const wanted = modelTokens(spec.modelName).sort().join(' ')
    if (!wanted) return { kind: 'none' }
    const candidates = prepared.filter(item =>
      item.tokens === wanted
      && (!spec.capacity || !item.capacity || item.capacity === spec.capacity)
      && (!spec.color || !item.color || item.color === spec.color))
    // Preferir los que coinciden en capacidad/color explícitamente.
    const strict = candidates.filter(item => (!spec.capacity || item.capacity === spec.capacity) && (!spec.color || item.color === spec.color))
    const pool = strict.length ? strict : candidates
    if (pool.length === 1) return { kind: 'one', productId: pool[0].id }
    if (pool.length > 1) return { kind: 'many', productIds: pool.map(item => item.id) }
    return { kind: 'none' }
  }
}
