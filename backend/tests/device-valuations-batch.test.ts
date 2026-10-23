import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// POST /api/device-valuations/batch: lote todo-o-nada, idempotente, con permisos, tenencia y una sola
// auditoría. La ruta se carga aislada (vm) con base, sesión y guard de módulo de mentira.
type Fila = { id: string; tenantId: string; model: string; modelKey: string; storage: string; condition: string; baseValuePyg: bigint; maxValuePyg: bigint | null; isActive: boolean; createdById: string }
let filas: Fila[] = []
let usuario: { id: string; tenantId: string; role: string; permissions: string[] } | null = null
let moduloApagado = false
let secuencia = 0
const auditoria: Array<{ action: string; metadata: Record<string, any>; tenantId: string }> = []
const cumple = (fila: Fila, where: any) => (!where.tenantId || fila.tenantId === where.tenantId) && (!where.modelKey?.in || where.modelKey.in.includes(fila.modelKey))
const tx = {
  deviceValuation: {
    findMany: async ({ where }: any) => filas.filter(fila => cumple(fila, where)),
    update: async ({ where, data }: any) => { const fila = filas.find(item => item.id === where.id)!; Object.assign(fila, data, { baseValuePyg: BigInt(data.baseValuePyg), maxValuePyg: data.maxValuePyg == null ? null : BigInt(data.maxValuePyg) }); return fila },
    create: async ({ data }: any) => { const fila = { ...data, id: `v${++secuencia}`, baseValuePyg: BigInt(data.baseValuePyg), maxValuePyg: data.maxValuePyg == null ? null : BigInt(data.maxValuePyg) } as Fila; filas.push(fila); return fila },
  },
  auditLog: { create: async ({ data }: any) => { auditoria.push(data) } },
}
const real = { montos: require('../lib/montos'), input: require('../lib/payment-input'), catalogo: require('../lib/catalogo-apple.mjs') }
const dependencias: Record<string, unknown> = {
  '@prisma/client': { ProductCondition: { NEW: 'NEW', USED: 'USED', REFURBISHED: 'REFURBISHED' } },
  '../../../../lib/prisma': { prisma: { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => { const copia = filas.map(fila => ({ ...fila })); const antes = auditoria.length; try { return await fn(tx) } catch (cause) { filas = copia; auditoria.length = antes; throw cause } } } },
  '../../../../lib/auth': {
    requireSession: async () => usuario ? { user: usuario } : null,
    canAccessAny: (user: { role: string; permissions: string[] }, permisos: string[]) => user.role === 'ADMIN' || permisos.some(permiso => user.permissions.includes(permiso)),
  },
  '../../../../lib/http': {
    json: (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data, (_clave, valor) => typeof valor === 'bigint' ? Number(valor) : valor), { ...init, headers: { 'content-type': 'application/json' } }),
    error: (message: string, status = 400) => Response.json({ message }, { status }),
  },
  '../../../../lib/payment-input': real.input,
  '../../../../lib/montos': real.montos,
  '../../../../lib/modulos-guard': { moduloGuard: async () => moduloApagado ? Response.json({ message: 'El módulo Trade-In está desactivado.' }, { status: 403 }) : null },
  '../../../../lib/catalogo-apple.mjs': real.catalogo,
}
const routePath = path.resolve(__dirname, '../app/api/device-valuations/batch/route.ts')
const routeExports: Record<string, unknown> = {}
runInNewContext(ts.transpileModule(readFileSync(routePath, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: routeExports,
  require: (name: string) => { assert.ok(Object.hasOwn(dependencias, name), `Import inesperado: ${name}`); return dependencias[name] },
  console, Error, Number, Object, Array, Set, Map, String, Math,
}, { filename: routePath })
const { POST } = routeExports as { POST: (r: Request) => Promise<Response> }
const lote = (rows: unknown) => POST(new Request('https://api.example.test/api/device-valuations/batch', { method: 'POST', body: JSON.stringify({ rows }) }))
const admin = (tenantId = 'tenant-1') => ({ id: 'user-1', tenantId, role: 'ADMIN', permissions: [] as string[] })
const reset = () => { filas = []; secuencia = 0; auditoria.length = 0; moduloApagado = false; usuario = admin() }
const fila = (extra: Record<string, unknown> = {}) => ({ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', baseValuePyg: 5600000, maxValuePyg: 6200000, ...extra })

test('lote: crea, actualiza y deja una sola auditoría con el antes y el después', async () => {
  reset()
  const primero = await lote([fila(), fila({ storage: '512 gb', baseValuePyg: 6000000, maxValuePyg: null })])
  assert.equal(primero.status, 200)
  const creados = (await primero.json()) as any
  assert.deepEqual([creados.created, creados.updated, creados.unchanged], [2, 0, 0])
  assert.equal(filas.length, 2)
  assert.equal(filas[1].storage, '512GB', 'la capacidad se guarda en forma canónica')
  assert.equal(auditoria.length, 1)
  assert.equal(auditoria[0].action, 'DEVICE_VALUATION_BATCH')
  const segundo = await (await lote([fila({ baseValuePyg: 5700000 })])).json() as any
  assert.deepEqual([segundo.created, segundo.updated, segundo.unchanged], [0, 1, 0])
  assert.equal(auditoria.length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(auditoria[1].metadata.cambios[0].from)), { base: 5600000, max: 6200000, active: true })
  assert.equal(auditoria[1].metadata.cambios[0].to.base, 5700000)
})

test('lote idempotente: repetir el mismo lote no cambia nada ni audita', async () => {
  reset()
  await lote([fila(), fila({ condition: 'NEW', baseValuePyg: 8000000, maxValuePyg: null })])
  const auditorias = auditoria.length
  const copia = JSON.stringify(filas, (_k, v) => typeof v === 'bigint' ? Number(v) : v)
  const repetido = await (await lote([fila(), fila({ condition: 'NEW', baseValuePyg: 8000000, maxValuePyg: null })])).json() as any
  assert.deepEqual([repetido.created, repetido.updated, repetido.unchanged], [0, 0, 2])
  assert.equal(auditoria.length, auditorias)
  assert.equal(JSON.stringify(filas, (_k, v) => typeof v === 'bigint' ? Number(v) : v), copia)
})

test('lote: sin permiso de productos es 403 y no escribe', async () => {
  reset(); usuario = { id: 'user-2', tenantId: 'tenant-1', role: 'VENDEDOR', permissions: [] }
  const respuesta = await lote([fila()])
  assert.equal(respuesta.status, 403)
  assert.equal(filas.length, 0)
  usuario = null
  assert.equal((await lote([fila()])).status, 401)
})

test('lote: con el módulo Trade-In apagado responde el guard', async () => {
  reset(); moduloApagado = true
  assert.equal((await lote([fila()])).status, 403)
  assert.equal(filas.length, 0)
})

test('lote: tenencia, solo toca valores de la empresa de la sesión', async () => {
  reset()
  filas.push({ id: 'ajena', tenantId: 'tenant-2', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '256GB', condition: 'USED', baseValuePyg: BigInt(1), maxValuePyg: null, isActive: true, createdById: 'otro' })
  const respuesta = await (await lote([fila()])).json() as any
  assert.deepEqual([respuesta.created, respuesta.updated], [1, 0], 'el valor de la otra empresa no cuenta como existente')
  assert.equal(filas.find(item => item.id === 'ajena')!.baseValuePyg, BigInt(1))
  assert.equal(filas.filter(item => item.tenantId === 'tenant-1').length, 1)
  assert.equal(auditoria[0].tenantId, 'tenant-1')
})

test('lote todo o nada: una capacidad que el modelo no trae rechaza el lote entero', async () => {
  reset()
  const respuesta = await lote([fila(), fila({ storage: '128GB' })])
  assert.equal(respuesta.status, 400)
  assert.match(((await respuesta.json()) as any).message, /Fila 2: iPhone 15 Pro Max no viene en 128GB/)
  assert.equal(filas.length, 0)
  assert.equal(auditoria.length, 0)
})

test('lote: valida montos, condición, repetidos y tamaño', async () => {
  reset()
  assert.equal((await lote([fila({ baseValuePyg: 0 })])).status, 400)
  assert.equal((await lote([fila({ baseValuePyg: 'abc' })])).status, 400)
  assert.equal((await lote([fila({ baseValuePyg: 5000000, maxValuePyg: 4000000 })])).status, 400)
  assert.equal((await lote([fila({ condition: 'BROKEN' })])).status, 400)
  const repetidos = await lote([fila(), fila()])
  assert.equal(repetidos.status, 400)
  assert.match(((await repetidos.json()) as any).message, /repite/)
  assert.equal((await lote([])).status, 400)
  assert.equal((await lote(Array.from({ length: 601 }, (_, indice) => fila({ storage: '256GB', model: `Otro ${indice}` })))).status, 400)
  assert.equal(filas.length, 0)
})

test('lote: un modelo fuera del catálogo se guarda tal cual y desactivar conserva el valor', async () => {
  reset()
  await lote([{ model: 'Samsung Galaxy S23', storage: '256GB', condition: 'USED', baseValuePyg: 2200000, maxValuePyg: 2600000 }])
  assert.equal(filas[0].modelKey, 'samsung galaxy s23')
  const apagado = await (await lote([{ model: 'Samsung Galaxy S23', storage: '256GB', condition: 'USED', baseValuePyg: 2200000, maxValuePyg: 2600000, isActive: false }])).json() as any
  assert.equal(apagado.updated, 1)
  assert.equal(filas[0].isActive, false)
  assert.equal(filas[0].baseValuePyg, BigInt(2200000))
})
