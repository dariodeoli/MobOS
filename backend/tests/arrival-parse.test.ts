import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCatalogMatcher, extractModelSpec, isScientificNotation, luhnValid, normalizeText, parseArrivalPaste, parseNote,
  type ParseOptions,
} from '../lib/arrival-parse'

// #408 unidad C · parser del pegado de llegada. Fixtures de la planilla real de
// Dario («STOCK ASU 2025»): una fila por equipo con modelo, IMEI/serie,
// proveedor en sigla, costo USD y nota.

function withLuhn(prefix14: string): string {
  for (let d = 0; d < 10; d++) if (luhnValid(`${prefix14}${d}`)) return `${prefix14}${d}`
  throw new Error('sin dígito de control')
}
const IMEI_A = withLuhn('35279300112233')
const IMEI_B = withLuhn('35440811223344')
const IMEI_C = withLuhn('86400205566778')
const IMEI_D = withLuhn('35911012345678')
const IMEI_E = withLuhn('49015420323751')

const catalog = [
  { id: 'p18pm-neg', name: 'iPhone 18 Pro Max 256GB Negro' },
  { id: 'p18pm-azul', name: 'iPhone 18 Pro Max 256GB Azul' },
  { id: 'p17pm-azul', name: 'iPhone 17 Pro Max 256GB Azul' },
  { id: 'pipad', name: 'iPad Air M4 11 128GB Space Gray' },
  { id: 'p15-neg', name: 'iPhone 15 256GB Negro' },
  { id: 'p15pro-neg', name: 'iPhone 15 Pro 256GB Negro' },
  { id: 's26', name: 'Samsung Galaxy S26 Ultra 12/256GB Black' },
  { id: 'p16pro-1tb', name: 'iPhone 16 Pro 1TB' },
  { id: 'dup-a', name: 'iPhone 14 128GB Negro' },
  { id: 'dup-b', name: 'iPhone 14 128GB Negro' },
]
const suppliers = [
  { id: 's-hh', code: 'HH' }, { id: 's-sb', code: 'SB' }, { id: 's-gta', code: 'GTA' }, { id: 's-nis', code: 'NIS' }, { id: 's-mtr', code: 'MTR' },
]
const options: ParseOptions = { currency: 'USD', suppliers, matchProduct: createCatalogMatcher(catalog) }
const tsv = (...cells: string[]) => cells.join('\t')
const codes = (row: { issues: Array<{ code: string }> }) => row.issues.map(i => i.code)

test('utilidades: normalización, Luhn y notación científica', () => {
  assert.equal(normalizeText('  Técnico  Garantía '), 'TECNICO GARANTIA')
  assert.equal(luhnValid('490154203237518'), true)
  assert.equal(luhnValid('490154203237519'), false)
  assert.equal(isScientificNotation('3,52793E+14'), true)
  assert.equal(isScientificNotation('3.52793e14'), true)
  assert.equal(isScientificNotation('352793001122334'), false)
})

test('modelo: capacidad, color, región y código de modelo («18 PRO MAX NEGRO 256GB LL A3473»)', () => {
  const spec = extractModelSpec('18 PRO MAX NEGRO 256GB LL A3473')
  assert.equal(spec.modelName, '18 PRO MAX')
  assert.equal(spec.capacity, '256GB')
  assert.equal(spec.color, 'NEGRO')
  assert.equal(spec.region, 'LL')
  assert.equal(spec.modelCode, 'A3473')
  assert.equal(spec.condition, 'NEW')
})

test('modelo: batería, ciclos y garantía («17 PRO MAX 256GB AZUL 100% 61 CICLOS … GARANTIA MAYO 2027»)', () => {
  const spec = extractModelSpec('17 PRO MAX 256GB AZUL 100% 61 CICLOS GARANTIA MAYO 2027')
  assert.equal(spec.modelName, '17 PRO MAX')
  assert.equal(spec.batteryPct, 100)
  assert.equal(spec.batteryCycles, 61)
  assert.equal(spec.warrantyUntil, '2027-05-31')
  assert.equal(spec.condition, 'USED')
  assert.equal(spec.color, 'AZUL')
})

test('modelo: «100% 0 CICLOS» sigue siendo nuevo; batería menor a 100% es usado', () => {
  assert.equal(extractModelSpec('17 PRO 256GB 100% 0 CICLOS').condition, 'NEW')
  assert.equal(extractModelSpec('15 PRO 256GB 87%').condition, 'USED')
  assert.equal(extractModelSpec('16 PRO 1TB 100%').condition, 'USED')
})

test('modelo: SEMI y USADO fuerzan usado; NUEVO y SELLADO fuerzan nuevo aunque haya batería', () => {
  assert.equal(extractModelSpec('14 128GB SEMI').condition, 'USED')
  assert.equal(extractModelSpec('14 128GB SEMINUEVO').condition, 'USED')
  assert.equal(extractModelSpec('14 128GB USADO').condition, 'USED')
  assert.equal(extractModelSpec('14 128GB NUEVO 95%').condition, 'NEW')
  assert.equal(extractModelSpec('14 128GB SELLADO').condition, 'NEW')
  assert.equal(extractModelSpec('14 128GB REACONDICIONADO').condition, 'REFURBISHED')
})

test('modelo: colores en español e inglés y compuestos («SPACE GRAY»)', () => {
  assert.equal(extractModelSpec('IPAD AIR M4 128GB 11\' SPACE GRAY').color, 'GRIS ESPACIAL')
  assert.equal(extractModelSpec('S26 ULTRA 256GB BLACK').color, 'NEGRO')
  assert.equal(extractModelSpec('15 256GB BLUE').color, 'AZUL')
  assert.equal(extractModelSpec('15 256GB ROSA').color, 'ROSA')
  assert.equal(extractModelSpec('17 PRO 256GB COSMIC ORANGE').color, 'NARANJA')
  assert.equal(extractModelSpec('15 256GB').color, null)
})

test('modelo: RAM/almacenamiento Samsung («12/256GB») y tamaño de iPad sin comillas', () => {
  const s = extractModelSpec('SAMSUNG S26 ULTRA 12/256GB BLACK')
  assert.equal(s.capacity, '256GB')
  assert.equal(s.ram, '12GB')
  assert.equal(s.modelName, 'SAMSUNG S26 ULTRA')
  assert.equal(extractModelSpec('IPAD AIR M4 128GB 11\' SPACE GRAY').modelName, 'IPAD AIR M4 11')
  assert.equal(extractModelSpec('16 PRO 1TB').capacity, '1TB')
})

test('modelo: garantía con mes ilegible avisa y no inventa la fecha', () => {
  const spec = extractModelSpec('15 256GB GARANTIA XYZ 2027')
  assert.equal(spec.warrantyUntil, null)
  assert.equal(spec.warnings[0].code, 'GARANTIA_ILEGIBLE')
  assert.equal(extractModelSpec('15 256GB GARANTIA FEBRERO 2028').warrantyUntil, '2028-02-29')
})

test('notas: #pedido, PEDIDO/RESERVADO cliente, CDE, SE DEVUELVE, CARGAR IMEI, NO LLEGÓ, TÉCNICO', () => {
  assert.equal(parseNote('#32056 klau').orderNumber, '32056')
  assert.equal(parseNote('#32056 klau').rest, 'KLAU')
  assert.equal(parseNote('PEDIDO INARA').customerHint, 'INARA')
  assert.equal(parseNote('Reservado Jadi').customerHint, 'JADI')
  assert.equal(parseNote('MANDAR CDE').sendToOtherBranch, true)
  assert.equal(parseNote('SE MANDA A CDE').sendToBranchHint, 'CDE')
  assert.equal(parseNote('SE DEVUELVE').returnToSupplier, true)
  assert.equal(parseNote('CARGAR IMEI').missingImei, true)
  for (const text of ['NO LLEGÓ', 'NO INGRESÓ', 'NO LLEGARON', 'no llego']) assert.equal(parseNote(text).notArrived, true, text)
  assert.equal(parseNote('TÉCNICO').technician, true)
  assert.equal(parseNote('').rest, '')
})

test('fila 1: «18 PRO MAX NEGRO 256GB LL A3473» con IMEI Luhn, proveedor HH, costo 1485 y nota TUPI', () => {
  const r = parseArrivalPaste(tsv('18 PRO MAX NEGRO 256GB LL A3473', IMEI_A, 'HH', '1485', 'TUPI'), options)
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.productId, 'p18pm-neg')
  assert.equal(row.serial, IMEI_A)
  assert.equal(row.serialKind, 'IMEI')
  assert.equal(row.supplierCode, 'HH')
  assert.equal(row.supplierId, 's-hh')
  assert.equal(row.originalCost, 1485)
  assert.equal(row.currency, 'USD')
  assert.equal(row.note, 'TUPI')
  assert.equal(row.hints.rest, 'TUPI')
  assert.equal(row.destination, 'STOCK')
  assert.equal(r.errorCount, 0)
})

test('fila 1 con IMEI en notación científica («3,52793E+14»): error «IMEI perdido por Excel»', () => {
  const r = parseArrivalPaste(tsv('18 PRO MAX NEGRO 256GB LL A3473', '3,52793E+14', 'HH', '1485', 'TUPI'), options)
  const row = r.rows[0]
  assert.equal(row.serial, null)
  assert.equal(row.serialKind, 'NINGUNO')
  assert.deepEqual(codes(row).filter(c => c === 'IMEI_EXCEL'), ['IMEI_EXCEL'])
  assert.match(row.issues.find(i => i.code === 'IMEI_EXCEL')!.message, /IMEI perdido por Excel, corregir/)
  assert.equal(row.supplierCode, 'HH')
  assert.equal(row.originalCost, 1485)
  assert.ok(r.errorCount >= 1)
})

test('IMEI de 15 dígitos con ceros finales se trata como perdido por Excel', () => {
  const row = parseArrivalPaste(tsv('15 NEGRO 256GB', '352793000000000', 'GTA', '665'), options).rows[0]
  assert.ok(codes(row).includes('IMEI_EXCEL'))
})

test('IMEI que no pasa Luhn es error pero se conserva para corregir', () => {
  const bad = IMEI_A.slice(0, 14) + String((Number(IMEI_A[14]) + 1) % 10)
  const row = parseArrivalPaste(tsv('15 NEGRO 256GB', bad, 'GTA', '665'), options).rows[0]
  assert.equal(row.serial, bad)
  assert.ok(codes(row).includes('IMEI_INVALIDO'))
})

test('fila 2: «17 PRO MAX 256GB AZUL 100% 61 CICLOS … GARANTIA MAYO 2027» trae batería, ciclos y garantía', () => {
  const r = parseArrivalPaste(tsv('17 PRO MAX 256GB AZUL 100% 61 CICLOS', IMEI_B, 'MTR', 'USD 990', 'GARANTIA MAYO 2027'), options)
  const row = r.rows[0]
  assert.equal(row.productId, 'p17pm-azul')
  assert.equal(row.condition, 'USED')
  assert.equal(row.spec.batteryPct, 100)
  assert.equal(row.spec.batteryCycles, 61)
  assert.equal(row.spec.warrantyUntil, '2027-05-31')
  assert.equal(row.originalCost, 990)
  assert.equal(row.supplierId, 's-mtr')
  assert.equal(r.errorCount, 0)
})

test('fila 3: iPad con serie alfanumérica («SLTWKF47RWL») es SERIE, sin IMEI', () => {
  const r = parseArrivalPaste(tsv('IPAD AIR M4 128GB 11\' SPACE GRAY', 'SLTWKF47RWL', 'SB', '720'), options)
  const row = r.rows[0]
  assert.equal(row.serialKind, 'SERIE')
  assert.equal(row.serial, 'SLTWKF47RWL')
  assert.equal(row.productId, 'pipad')
  assert.equal(row.supplierId, 's-sb')
  assert.equal(row.originalCost, 720)
  assert.equal(row.destination, 'STOCK')
  assert.equal(r.errorCount, 0)
})

test('fila 4: «15 NEGRO 256GB A/A» con nota «#32056 klau» → número de pedido', () => {
  const r = parseArrivalPaste(tsv('15 NEGRO 256GB A/A', IMEI_C, 'GTA', '665', '#32056 klau'), options)
  const row = r.rows[0]
  assert.equal(row.productId, 'p15-neg', '«15» no se confunde con «15 Pro»')
  assert.equal(row.hints.orderNumber, '32056')
  assert.equal(row.supplierId, 's-gta')
  assert.equal(row.originalCost, 665)
  assert.equal(r.errorCount, 0)
})

test('fila 5: «SAMSUNG S26 ULTRA 12/256GB BLACK … NIS … PEDIDO INARA» → pedido de la clienta', () => {
  const r = parseArrivalPaste(tsv('SAMSUNG S26 ULTRA 12/256GB BLACK', IMEI_D, 'NIS', '955', 'PEDIDO INARA'), options)
  const row = r.rows[0]
  assert.equal(row.productId, 's26')
  assert.equal(row.hints.customerHint, 'INARA')
  assert.equal(row.supplierId, 's-nis')
  assert.equal(r.errorCount, 0)
})

test('fila 6: «16 PRO 1TB 100% | SE DEVUELVE | CARGAR IMEI | HH | 820 | SE MANDA A CDE» → devolver, sin IMEI, aviso', () => {
  const r = parseArrivalPaste(tsv('16 PRO 1TB 100%', 'SE DEVUELVE', 'CARGAR IMEI', 'HH', '820', 'SE MANDA A CDE'), options)
  const row = r.rows[0]
  assert.equal(row.productId, 'p16pro-1tb')
  assert.equal(row.serial, null)
  assert.equal(row.supplierId, 's-hh')
  assert.equal(row.originalCost, 820)
  assert.equal(row.hints.returnToSupplier, true)
  assert.equal(row.hints.missingImei, true)
  assert.equal(row.hints.sendToOtherBranch, true)
  assert.equal(row.destination, 'DEVOLVER', 'devolver prevalece sobre CDE y CARGAR IMEI')
  assert.equal(r.errorCount, 0)
})

test('destino: CDE → OTRA_SUCURSAL; CARGAR IMEI → FALTA_IMEI; TÉCNICO → TECNICO; sin serie → FALTA_IMEI', () => {
  const rows = parseArrivalPaste([
    tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665', 'MANDAR CDE'),
    tsv('15 NEGRO 256GB', IMEI_B, 'GTA', '665', 'CARGAR IMEI'),
    tsv('15 NEGRO 256GB', IMEI_C, 'GTA', '665', 'TÉCNICO'),
    tsv('15 NEGRO 256GB', '', 'GTA', '665'),
  ].join('\n'), options).rows
  assert.deepEqual(rows.map(r => r.destination), ['OTRA_SUCURSAL', 'FALTA_IMEI', 'TECNICO', 'FALTA_IMEI'])
  assert.ok(codes(rows[3]).includes('FALTA_IMEI'))
})

test('NO LLEGÓ / NO INGRESÓ / NO LLEGARON marcan la fila como declarada no llegada', () => {
  const rows = parseArrivalPaste([
    tsv('15 NEGRO 256GB', '', 'GTA', '665', 'NO LLEGÓ'),
    tsv('15 NEGRO 256GB', '', 'GTA', '665', 'NO INGRESÓ'),
    tsv('15 NEGRO 256GB', '', 'GTA', '665', 'NO LLEGARON'),
  ].join('\n'), options).rows
  assert.deepEqual(rows.map(r => r.declaredNoLlego), [true, true, true])
  assert.ok(rows.every(r => !codes(r).includes('FALTA_IMEI')), 'no se pide IMEI de lo que no llegó')
})

test('bloques por fecha: «12/10/2026» y «07/10/2026 · VOS PEDÍS» abren bloque y se heredan por fila', () => {
  const r = parseArrivalPaste([
    '12/10/2026',
    tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665'),
    '',
    '-----',
    tsv('07/10/2026 · VOS PEDÍS'),
    tsv('15 NEGRO 256GB', IMEI_B, 'GTA', '665'),
    tsv('15 NEGRO 256GB', IMEI_C, 'GTA', '665'),
  ].join('\n'), options)
  assert.equal(r.blocks.length, 2)
  assert.deepEqual(r.blocks.map(b => [b.date, b.label, b.rows]), [['2026-10-12', null, 1], ['2026-10-07', 'VOS PEDÍS', 2]])
  assert.deepEqual(r.rows.map(x => [x.rowIndex, x.blockDate, x.blockLabel]), [
    [1, '2026-10-12', null], [2, '2026-10-07', 'VOS PEDÍS'], [3, '2026-10-07', 'VOS PEDÍS'],
  ])
})

test('fecha inválida (31/02/2026) marca el bloque con error', () => {
  const r = parseArrivalPaste(['31/02/2026', tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665')].join('\n'), options)
  assert.equal(r.blocks[0].date, null)
  assert.match(r.blocks[0].error ?? '', /Fecha inválida/)
  assert.ok(r.errorCount >= 1)
})

test('separador «;», líneas vacías, separadores y encabezado se ignoran', () => {
  const r = parseArrivalPaste([
    'MODELO;IMEI;PROV;COSTO',
    '',
    '=====',
    `15 NEGRO 256GB;${IMEI_A};GTA;665`,
    ';;;',
  ].join('\n'), options)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].originalCost, 665)
})

test('CRLF y comillas de Excel no rompen las celdas', () => {
  const r = parseArrivalPaste(`"15 NEGRO 256GB"\t${IMEI_A}\tGTA\t665\r\n`, options)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].productId, 'p15-neg')
})

test('duplicados dentro del pegado: todas las filas repetidas quedan marcadas', () => {
  const r = parseArrivalPaste([
    tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665'),
    tsv('15 NEGRO 256GB', IMEI_B, 'GTA', '665'),
    tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665'),
  ].join('\n'), options)
  assert.deepEqual(r.rows.map(row => codes(row).includes('DUPLICADO_EN_LOTE')), [true, false, true])
  assert.match(r.rows[0].issues.at(-1)!.message, /fila 1, fila 3/)
})

test('proveedor desconocido es error y no se crea; sin sigla también', () => {
  const unknown = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'ZZZ', '665'), options).rows[0]
  assert.ok(codes(unknown).includes('PROVEEDOR_DESCONOCIDO'))
  assert.equal(unknown.supplierId, null)
  assert.equal(unknown.supplierCode, 'ZZZ')
  const missing = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, '665'), options).rows[0]
  assert.ok(codes(missing).includes('PROVEEDOR_FALTA'))
})

test('proveedor en distinta posición se reconoce si es una sigla conocida', () => {
  const row = parseArrivalPaste(tsv('15 NEGRO 256GB', 'GTA', IMEI_A, '665'), options).rows[0]
  assert.equal(row.supplierId, 's-gta')
  assert.equal(row.serial, IMEI_A)
  assert.equal(row.originalCost, 665)
})

test('costo: «USD 900», «900», «$ 900» y decimales con coma', () => {
  const rows = parseArrivalPaste([
    tsv('15 NEGRO 256GB', IMEI_A, 'GTA', 'USD 900'),
    tsv('15 NEGRO 256GB', IMEI_B, 'GTA', '900'),
    tsv('15 NEGRO 256GB', IMEI_C, 'GTA', '$ 900'),
    tsv('15 NEGRO 256GB', IMEI_D, 'GTA', '912,50'),
  ].join('\n'), options).rows
  assert.deepEqual(rows.map(r => r.originalCost), [900, 900, 900, 912.5])
  assert.ok(rows.every(r => r.currency === 'USD'))
})

test('costo en lote en guaraníes: «USD 900» es error de moneda; montos grandes con puntos', () => {
  const pyg: ParseOptions = { ...options, currency: 'PYG' }
  const usd = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'GTA', 'USD 900'), pyg).rows[0]
  assert.ok(codes(usd).includes('MONEDA_DISTINTA'))
  const big = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '5.500.000'), pyg).rows[0]
  assert.equal(big.originalCost, 5500000)
  assert.equal(big.serial, IMEI_A)
  const bigNoDots = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '12000000'), pyg).rows[0]
  assert.equal(bigNoDots.originalCost, 12000000)
})

test('sin costo: aviso, no error', () => {
  const r = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'GTA'), options)
  assert.equal(r.rows[0].originalCost, null)
  assert.ok(codes(r.rows[0]).includes('COSTO_FALTA'))
  assert.equal(r.errorCount, 0)
})

test('catálogo: sin coincidencia es error y nunca crea producto', () => {
  const row = parseArrivalPaste(tsv('99 ULTRA MEGA 256GB', IMEI_A, 'GTA', '665'), options).rows[0]
  assert.equal(row.productId, null)
  assert.ok(codes(row).includes('PRODUCTO_NO_ENCONTRADO'))
})

test('catálogo: varias coincidencias piden elegir y listan los candidatos', () => {
  const row = parseArrivalPaste(tsv('14 NEGRO 128GB', IMEI_A, 'GTA', '500'), options).rows[0]
  assert.equal(row.productId, null)
  assert.deepEqual(row.productCandidates.sort(), ['dup-a', 'dup-b'])
  assert.ok(codes(row).includes('ELEGIR_PRODUCTO'))
})

test('catálogo: la capacidad y el color desambiguan entre variantes del mismo modelo', () => {
  const m = createCatalogMatcher(catalog)
  assert.deepEqual(m(extractModelSpec('18 PRO MAX NEGRO 256GB')), { kind: 'one', productId: 'p18pm-neg' })
  assert.deepEqual(m(extractModelSpec('18 PRO MAX AZUL 256GB')), { kind: 'one', productId: 'p18pm-azul' })
  assert.deepEqual(m(extractModelSpec('18 PRO MAX 512GB NEGRO')), { kind: 'none' })
  assert.equal(m(extractModelSpec('18 PRO MAX 256GB')).kind, 'many')
  assert.deepEqual(m(extractModelSpec('15 PRO NEGRO 256GB')), { kind: 'one', productId: 'p15pro-neg' })
})

test('matcher inyectado: el parser delega la decisión y no mira el catálogo', () => {
  let received: string | null = null
  const row = parseArrivalPaste(tsv('LO QUE SEA 64GB', IMEI_A, 'GTA', '10'), {
    ...options,
    matchProduct: spec => { received = spec.modelName; return { kind: 'one', productId: 'x' } },
  }).rows[0]
  assert.equal(received, 'LO QUE SEA')
  assert.equal(row.productId, 'x')
})

test('raw conserva las celdas y la línea original para auditar', () => {
  const r = parseArrivalPaste(['12/10/2026', tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665', '#32056 klau')].join('\n'), options)
  assert.deepEqual(r.rows[0].raw, { cells: ['15 NEGRO 256GB', IMEI_A, 'GTA', '665', '#32056 klau'], line: 2 })
  assert.equal(r.rows[0].line, 2)
})

test('serie de Watch de 10 dígitos con letras y IMEI con espacios o guiones', () => {
  const watch = parseArrivalPaste(tsv('15 NEGRO 256GB', 'H2QX93KLM4', 'SB', '300'), options).rows[0]
  assert.equal(watch.serialKind, 'SERIE')
  const spaced = parseArrivalPaste(tsv('15 NEGRO 256GB', `${IMEI_A.slice(0, 8)} ${IMEI_A.slice(8)}`, 'GTA', '665'), options).rows[0]
  assert.equal(spaced.serial, IMEI_A)
  assert.equal(spaced.serialKind, 'IMEI')
})

test('texto libre en la nota («FINANCIACIÓN») no se confunde con serie ni con proveedor', () => {
  const row = parseArrivalPaste(tsv('15 NEGRO 256GB', IMEI_A, 'GTA', '665', 'FINANCIACIÓN'), options).rows[0]
  assert.equal(row.serial, IMEI_A)
  assert.equal(row.supplierCode, 'GTA')
  assert.equal(row.hints.rest, 'FINANCIACION')
})

test('lote completo de la planilla: seis filas, contadores de error y de aviso', () => {
  const paste = [
    '12/10/2026',
    tsv('18 PRO MAX NEGRO 256GB LL A3473', IMEI_A, 'HH', '1485', 'TUPI'),
    tsv('17 PRO MAX 256GB AZUL 100% 61 CICLOS', IMEI_B, 'MTR', '990', 'GARANTIA MAYO 2027'),
    tsv('IPAD AIR M4 128GB 11\' SPACE GRAY', 'SLTWKF47RWL', 'SB', '720'),
    '07/10/2026 · VOS PEDÍS',
    tsv('15 NEGRO 256GB A/A', IMEI_C, 'GTA', '665', '#32056 klau'),
    tsv('SAMSUNG S26 ULTRA 12/256GB BLACK', IMEI_D, 'NIS', '955', 'PEDIDO INARA'),
    tsv('16 PRO 1TB 100%', 'SE DEVUELVE', 'CARGAR IMEI', 'HH', '820', 'SE MANDA A CDE'),
  ].join('\n')
  const r = parseArrivalPaste(paste, options)
  assert.equal(r.rows.length, 6)
  assert.equal(r.blocks.length, 2)
  assert.equal(r.errorCount, 0)
  assert.deepEqual(r.rows.map(x => x.destination), ['STOCK', 'STOCK', 'STOCK', 'STOCK', 'STOCK', 'DEVOLVER'])
  assert.deepEqual(r.rows.map(x => x.blockDate), ['2026-10-12', '2026-10-12', '2026-10-12', '2026-10-07', '2026-10-07', '2026-10-07'])
})

test('texto vacío o solo separadores no produce filas', () => {
  assert.deepEqual(parseArrivalPaste('', options).rows, [])
  assert.deepEqual(parseArrivalPaste('\n\n---\n', options).rows, [])
})
