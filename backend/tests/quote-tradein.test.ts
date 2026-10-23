import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Cotización con equipo que entrega el cliente: el valor sale de la tabla de la empresa (no del cliente),
// se valida contra el catálogo y el faltante nunca es negativo.
type Valor = { tenantId: string; model: string; modelKey: string; storage: string; condition: string; baseValuePyg: bigint; maxValuePyg: bigint | null; isActive: boolean }
const valores: Valor[] = [
  { tenantId: 'tenant-1', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '256GB', condition: 'USED', baseValuePyg: BigInt(5600000), maxValuePyg: BigInt(6200000), isActive: true },
  { tenantId: 'tenant-2', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '512GB', condition: 'USED', baseValuePyg: BigInt(9999999), maxValuePyg: null, isActive: true },
  { tenantId: 'tenant-1', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '1TB', condition: 'USED', baseValuePyg: BigInt(7000000), maxValuePyg: null, isActive: false },
]
const dependencias: Record<string, unknown> = {
  '@prisma/client': { ProductCondition: { NEW: 'NEW', USED: 'USED', REFURBISHED: 'REFURBISHED' } },
  './prisma': { prisma: { deviceValuation: { findFirst: async ({ where }: any) => valores.find(v => v.tenantId === where.tenantId && v.modelKey === where.modelKey && v.storage === where.storage && v.condition === where.condition && (where.isActive === undefined || v.isActive === where.isActive)) ?? null } } },
  './montos': require('../lib/montos'),
  './catalogo-apple.mjs': require('../lib/catalogo-apple.mjs'),
}
const libPath = path.resolve(__dirname, '../lib/quote-tradein.ts')
const exportsLib: Record<string, unknown> = {}
runInNewContext(ts.transpileModule(readFileSync(libPath, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exportsLib,
  require: (name: string) => { assert.ok(Object.hasOwn(dependencias, name), `Import inesperado: ${name}`); return dependencias[name] },
  Error, Object, Number, Math, Array,
}, { filename: libPath })
const { normalizarTradeInCotizacion, faltanteCotizacion, tradeInPublico, AVISO_VALOR_ESTIMADO } = exportsLib as typeof import('../lib/quote-tradein')

test('el valor del equipo sale de la tabla de la empresa, aunque el cliente mande otro monto', async () => {
  const equipo = await normalizarTradeInCotizacion({ model: 'iphone 15 pro max', storage: '256 gb', condition: 'USED', estimatedValuePyg: 99 }, 'tenant-1')
  assert.deepEqual(JSON.parse(JSON.stringify(equipo)), { model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', estimatedValuePyg: 5600000, maxValuePyg: 6200000 })
  assert.equal(await normalizarTradeInCotizacion(null, 'tenant-1'), null)
  assert.equal(await normalizarTradeInCotizacion(undefined, 'tenant-1'), null)
})

test('sin valor cargado, valor inactivo o de otra empresa: 409 con mensaje claro', async () => {
  for (const [storage, tenant] of [['512GB', 'tenant-1'], ['1TB', 'tenant-1']]) {
    await assert.rejects(() => normalizarTradeInCotizacion({ model: 'iPhone 15 Pro Max', storage, condition: 'USED' }, tenant), (cause: any) => cause.status === 409 && /No hay un valor de toma/.test(cause.message))
  }
  await assert.rejects(() => normalizarTradeInCotizacion({ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED' }, 'tenant-3'), (cause: any) => cause.status === 409)
})

test('capacidad que el modelo no trae, condición inválida o modelo vacío: 400', async () => {
  await assert.rejects(() => normalizarTradeInCotizacion({ model: 'iPhone 15 Pro Max', storage: '128GB', condition: 'USED' }, 'tenant-1'), (cause: any) => cause.status === 400 && /no viene en 128GB/.test(cause.message))
  await assert.rejects(() => normalizarTradeInCotizacion({ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'ROTO' }, 'tenant-1'), (cause: any) => cause.status === 400)
  await assert.rejects(() => normalizarTradeInCotizacion({ model: '  ', storage: '256GB', condition: 'USED' }, 'tenant-1'), (cause: any) => cause.status === 400)
  await assert.rejects(() => normalizarTradeInCotizacion('iPhone', 'tenant-1'), (cause: any) => cause.status === 400)
})

test('faltante: total menos el valor estimado, nunca negativo', () => {
  assert.equal(faltanteCotizacion(8000000, { estimatedValuePyg: 5600000 }), 2400000)
  assert.equal(faltanteCotizacion(5000000, { estimatedValuePyg: 5600000 }), 0)
  assert.equal(faltanteCotizacion(5000000, null), 5000000)
})

test('vista pública: sin ids ni datos internos y con el aviso fijo', () => {
  const vista = tradeInPublico({ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', estimatedValuePyg: 5600000, maxValuePyg: 6200000, valuationId: 'x' }, 8000000)!
  assert.equal(vista.faltantePyg, 2400000)
  assert.equal(vista.aviso, AVISO_VALOR_ESTIMADO)
  assert.match(vista.aviso, /Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda \(batería, estado, fallas\)\./)
  assert.ok(!('maxValuePyg' in vista) && !('valuationId' in vista))
  assert.equal(tradeInPublico(null, 1), null)
})
