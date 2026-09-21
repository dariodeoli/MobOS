import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const routePath = require.resolve('../app/api/aex/ship/route.ts')
const source = ts.transpileModule(readFileSync(routePath, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

let quoteCalls = 0
let shipCalls = 0
let writeCalls = 0
const quotes = [{ serviceId: 1, serviceName: 'Entrega', costPyg: 12000, deliveryHours: 24 }]
const modules: Record<string, unknown> = {
  '../../../../lib/prisma': { prisma: {
    stockTransfer: {
      findFirst: async () => ({ id: 'transfer-1', sourceBranch: { city: 'Asunción' }, destinationBranch: { city: 'Encarnación' } }),
      update: async () => { writeCalls += 1 },
    },
    auditLog: { create: async () => { writeCalls += 1 } },
  } },
  '../../../../lib/http': {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    error: (message: string, status = 400) => Response.json({ message }, { status }),
  },
  '../../../../lib/auth': { requireSession: async () => ({ user: { id: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' } }) },
  '../../../../lib/aex': {
    aexQuote: async () => { quoteCalls += 1; return quotes },
    aexShip: async () => { shipCalls += 1; throw new Error('AEX submission must not run') },
    aexWebTrackingUrl: () => 'https://aex.test/',
  },
}
const routeExports: Record<string, unknown> = {}
runInNewContext(source, {
  exports: routeExports,
  require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`)
    return modules[name]
  },
})
const post = routeExports.POST as (request: Request) => Promise<Response>
const request = (confirm: boolean) => new Request('https://api.example.test/api/aex/ship', {
  method: 'POST',
  body: JSON.stringify({ transferId: 'transfer-1', pesoKg: 2, confirm }),
})

async function main() {
  const blocked = await post(request(true))
  assert.equal(blocked.status, 501)
  assert.match((await blocked.json()).message, /remitente y destinatario/)
  assert.equal(quoteCalls, 0)
  assert.equal(shipCalls, 0)
  assert.equal(writeCalls, 0)

  const quoted = await post(request(false))
  assert.equal(quoted.status, 200)
  assert.deepEqual(await quoted.json(), { unconfigured: false, quotes, origen: 'Asunción', destino: 'Encarnación' })
  assert.equal(quoteCalls, 1)
  assert.equal(shipCalls, 0)
  assert.equal(writeCalls, 0)
  console.log('aex-ship-route: confirmation blocked; quote preserved')
}

main().catch((failure) => { console.error(failure); process.exitCode = 1 })
