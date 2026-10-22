import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { newCompanyModuleStore } from '../lib/module-store'

// PUT /api/tenant/modules: solo el dueño real, 409 con saldos abiertos y auditoría. Se carga la ruta
// aislada (vm) con la base, la sesión y el chequeo de dueño de mentira.
type Saldos = { cuotas: number; giftCards: number; delivery: number; comisiones: number; tradein: number; unidades: number }
const sinSaldos = (): Saldos => ({ cuotas: 0, giftCards: 0, delivery: 0, comisiones: 0, tradein: 0, unidades: 0 })
let duenoReal = true
let saldos = sinSaldos()
let settings: Record<string, unknown> = {}
let escrituras = 0
const auditoria: Array<{ action: string }> = []
const agregado = (cantidad: number, suma = 0) => ({ _count: { _all: cantidad }, _sum: { amountPyg: BigInt(suma), remainingPyg: BigInt(0), balancePyg: BigInt(suma), totalPyg: BigInt(suma), valuePyg: BigInt(suma) } })
const tx = {
  $queryRaw: async () => [],
  tenant: {
    findUniqueOrThrow: async () => ({ settings }),
    update: async ({ data }: { data: { settings: Record<string, unknown> } }) => { escrituras += 1; settings = data.settings },
  },
  auditLog: { create: async ({ data }: { data: { action: string } }) => { auditoria.push(data) } },
  payment: { aggregate: async ({ where }: { where: { method?: string } }) => where.method === 'CREDIT' ? agregado(saldos.cuotas, saldos.cuotas * 100000) : agregado(saldos.delivery, saldos.delivery * 50000) },
  storeCredit: { aggregate: async () => agregado(0) },
  giftCard: { aggregate: async () => agregado(saldos.giftCards, saldos.giftCards * 200000) },
  deliverySettlement: { count: async () => 0 },
  commissionSettlement: { aggregate: async () => agregado(saldos.comisiones, saldos.comisiones * 80000) },
  inventoryUnit: { count: async () => saldos.unidades },
  tradeInDevice: { aggregate: async () => agregado(saldos.tradein, saldos.tradein * 900000) },
}
const real = {
  moduleStore: require('../lib/module-store'),
  saldos: require('../lib/modulos-saldos'),
}
const dependencias: Record<string, unknown> = {
  '@prisma/client': {},
  '../../../../lib/prisma': { prisma: { tenant: { findUnique: async () => ({ settings }) }, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } },
  '../../../../lib/auth': { requireSession: async () => ({ accountId: 'acc-1', user: { id: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' } }) },
  '../../../../lib/http': {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    error: (message: string, status = 400, details?: unknown) => Response.json({ message, ...(details === undefined ? {} : { details }) }, { status }),
  },
  '../../../../lib/module-store': real.moduleStore,
  '../../../../lib/modulos-guard': { esDuenoReal: async () => duenoReal },
  '../../../../lib/modulos-saldos': real.saldos,
  // La decisión por datos tiene sus pruebas en modulos-datos.test.ts.
  '../../../../lib/modulos-datos': { asegurarModulosPorDatos: async (_db: unknown, _tenantId: string, actuales?: unknown) => actuales === undefined ? settings : actuales },
}
const routePath = path.resolve(__dirname, '../app/api/tenant/modules/route.ts')
const routeExports: Record<string, unknown> = {}
runInNewContext(ts.transpileModule(readFileSync(routePath, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: routeExports,
  require: (name: string) => { assert.ok(Object.hasOwn(dependencias, name), `Import inesperado: ${name}`); return dependencias[name] },
  console,
  Error,
}, { filename: routePath })
const { GET, PUT } = routeExports as { GET: (r: Request) => Promise<Response>; PUT: (r: Request) => Promise<Response> }
const put = (body: unknown) => PUT(new Request('https://api.example.test/api/tenant/modules', { method: 'PUT', body: JSON.stringify(body) }))
const reset = () => { duenoReal = true; saldos = sinSaldos(); settings = {}; escrituras = 0; auditoria.length = 0 }
const apagarModulo = (moduleId: string) => put({ moduleId, enabled: false })

test('PUT módulos: un ADMIN que no es el dueño real recibe 403 y no cambia nada', async () => {
  reset(); duenoReal = false
  const respuesta = await apagarModulo('tradein')
  assert.equal(respuesta.status, 403)
  assert.match(((await respuesta.json()) as { message: string }).message, /dueño/)
  assert.equal(escrituras, 0)
  assert.equal(auditoria.length, 0)
})

test('GET módulos: canManage solo es verdadero para el dueño real', async () => {
  reset(); duenoReal = false
  assert.equal(((await (await GET(new Request('https://api.example.test/api/tenant/modules'))).json()) as { canManage: boolean }).canManage, false)
  duenoReal = true
  const cuerpo = await (await GET(new Request('https://api.example.test/api/tenant/modules'))).json() as { canManage: boolean; catalogVersion: number; state: { version: number } }
  assert.equal(cuerpo.canManage, true)
  assert.equal(cuerpo.state.version, 2)
})

test('PUT módulos: el dueño apaga un módulo sin saldos, queda en versión 2 y en auditoría', async () => {
  reset()
  const respuesta = await apagarModulo('gift-cards')
  assert.equal(respuesta.status, 200)
  assert.equal(escrituras, 1)
  assert.equal(auditoria[0].action, 'TENANT_MODULES_UPDATED')
  const guardado = (settings.moduleStore as { version: number; modules: Record<string, { enabled: boolean }> })
  assert.equal(guardado.version, 2)
  assert.equal(guardado.modules['gift-cards'].enabled, false)
  assert.equal(guardado.modules.promociones.enabled, true)
})

test('PUT módulos: 409 al desactivar con saldos abiertos y no escribe nada', async () => {
  const casos: Array<[string, keyof Saldos, RegExp]> = [
    ['cuotas', 'cuotas', /cuota/], ['gift-cards', 'giftCards', /gift card/], ['delivery', 'delivery', /reparto/],
    ['comisiones', 'comisiones', /comisiones/], ['tradein', 'tradein', /equipo/],
  ]
  for (const [moduleId, clave, texto] of casos) {
    reset(); saldos[clave] = 2
    const respuesta = await apagarModulo(moduleId)
    assert.equal(respuesta.status, 409, moduleId)
    const cuerpo = await respuesta.json() as { message: string; details: { code: string; saldos: Array<{ moduleId: string; cantidad: number }> } }
    assert.match(cuerpo.message, texto, moduleId)
    assert.equal(cuerpo.details.code, 'MODULE_OPEN_BALANCES')
    assert.equal(cuerpo.details.saldos[0].moduleId, moduleId)
    assert.equal(escrituras, 0, `${moduleId}: no se guarda`)
    assert.equal(auditoria.length, 0)
    // Resueltos los saldos, se puede apagar.
    saldos = sinSaldos()
    assert.equal((await apagarModulo(moduleId)).status, 200, `${moduleId} sin saldos`)
  }
})

test('PUT módulos: los saldos de un módulo no bloquean apagar otro, ni volver a activar', async () => {
  reset(); saldos.cuotas = 3
  assert.equal((await apagarModulo('tradein')).status, 200)
  settings = { moduleStore: { ...newCompanyModuleStore() } }
  assert.equal((await put({ moduleId: 'cuotas', enabled: true })).status, 200)
})

test('PUT módulos: un preset que apaga un módulo con saldos también da 409', async () => {
  reset(); saldos.tradein = 1
  const respuesta = await put({ preset: 'salud' })
  assert.equal(respuesta.status, 409)
  assert.equal(escrituras, 0)
})

test('PUT módulos: núcleo, dependencias y cuerpos inválidos', async () => {
  reset()
  assert.equal((await apagarModulo('ventas')).status, 409)
  assert.equal((await put({ moduleId: 'inexistente', enabled: true })).status, 400)
  assert.equal((await put('basura')).status, 400)
  assert.equal(escrituras, 0)
})

test('PUT módulos: «Inventario por unidades» no se apaga mientras haya equipos con IMEI en stock', async () => {
  reset(); saldos.unidades = 3
  const respuesta = await apagarModulo('inventario-unidades')
  assert.equal(respuesta.status, 409)
  assert.match(JSON.stringify(await respuesta.json()), /equipo\(s\) con IMEI/)
  assert.equal(escrituras, 0)
  saldos.unidades = 0
  assert.equal((await apagarModulo('inventario-unidades')).status, 200)
})
