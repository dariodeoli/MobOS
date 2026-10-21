import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// requestId por empresa y sin doble consulta al proveedor (#193): ejecuta la ruta
// real contra un prisma en memoria que replica los únicos de la base (global por
// requestId y por (tenantId, requestId)) y cuenta las llamadas al proveedor.
const routePath = require.resolve('../app/api/imei/route.ts')
const source = ts.transpileModule(readFileSync(routePath, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const real = require('../lib/imeicheck')
let providerCalls = 0
let currentTenant = 'tenant-a'
const rows: any[] = []
const pause = () => new Promise(resolve => setTimeout(resolve, 5))

const prisma = { auditLog: { create: async () => ({}) }, imeiCheckQuery: {
  findFirst: async ({ where }: any) => { await pause(); return rows.find(r => r.tenantId === where.tenantId && r.requestId === where.requestId) ?? null },
  create: async ({ data }: any) => {
    await pause()
    if (rows.some(r => r.requestId === data.requestId)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    const row = { id: `row-${rows.length + 1}`, requestedAt: new Date(), resolvedAt: null, normalized: [], ...data }
    rows.push(row)
    return row
  },
  update: async ({ where, data }: any) => { await pause(); const row = rows.find(r => r.id === where.id); Object.assign(row, data); return row },
} }
const modules: Record<string, unknown> = {
  '../../../lib/prisma': { prisma },
  '../../../lib/http': { json: (data: unknown, init?: ResponseInit) => Response.json(data, init), error: (message: string, status = 400) => Response.json({ message }, { status }) },
  '../../../lib/auth': { requireSession: async () => ({ user: { id: 'u', tenantId: currentTenant, role: 'ADMIN', branchId: null } }), canAccessAny: () => true },
  '../../../lib/modulos-guard': { moduloGuard: async () => null },
  '../../../lib/imei-providers': { findImeiProvider: () => ({ id: 'imeicheck.net', availability: 'simulated' }), publicImeiProviders: () => [] },
  // Créditos: este test cubre el requestId; el saldo se prueba en imei-credits-http.mjs.
  '../../../lib/imei-credits': {
    creditosDeServicio: () => 1,
    correspondeReembolso: () => false,
    estadoCreditos: async () => ({ saldo: 99, enforce: true }),
    reembolsarConsulta: async () => 0,
    reservarConsulta: async ({ buscar, crear }: any) => {
      const existente = await buscar(prisma)
      return existente ? { tipo: 'existente', fila: existente } : { tipo: 'reservada', fila: await crear(prisma), consumidos: 1, enSombra: 0 }
    },
  },
  '../../../lib/imeicheck': { ...real, consultarImei: async (...args: unknown[]) => { providerCalls += 1; await pause(); return real.consultarImei(...args) } },
}
const routeExports: Record<string, any> = {}
runInNewContext(source, { exports: routeExports, console, process, Date, Number, String, Array, Promise, URL, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`); return modules[name] } })

const post = (requestId: string): Promise<Response> => routeExports.POST(new Request('https://api.example.test/api/imei', {
  method: 'POST',
  body: JSON.stringify({ action: 'checks', imei: '490154203237518', confirm: true, requestId }),
}))

async function main() {
  // 10 POST paralelos con el mismo requestId: una sola llamada al proveedor.
  const respuestas = await Promise.all(Array.from({ length: 10 }, () => post('req-paralelo')))
  assert.equal(providerCalls, 1, 'el proveedor se consulta una sola vez')
  assert.equal(rows.filter(r => r.requestId === 'req-paralelo').length, 1)
  assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 200, 200, 200, 200, 200, 200, 200, 200, 201])
  const finalRow = rows.find(r => r.requestId === 'req-paralelo')
  assert.equal(finalRow.status, 'verificado')

  // Otra empresa con el mismo requestId: 409 limpio, nada de la primera empresa.
  currentTenant = 'tenant-b'
  const cruzada = await post('req-paralelo')
  assert.equal(cruzada.status, 409)
  const cuerpo = await cruzada.json()
  assert.equal(cuerpo.message, 'requestId en uso')
  assert.equal(JSON.stringify(cuerpo).includes('7518'), false, 'no filtra datos de otra empresa')
  assert.equal(providerCalls, 1, 'el 409 no llama al proveedor')

  // La empresa dueña sigue recibiendo su propia consulta (idempotente).
  currentTenant = 'tenant-a'
  const repetida = await post('req-paralelo')
  assert.equal(repetida.status, 200)
  assert.equal((await repetida.json()).id, finalRow.id)
  assert.equal(providerCalls, 1)
  console.log('imei-request-id: OK (10 paralelos = 1 llamada, 409 entre empresas, repetición idempotente).')
}
main().catch(error => { console.error(error); process.exit(1) })
