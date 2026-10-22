import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { MODULE_CATALOG, moduloDePrefijo } from '../lib/modulos-catalogo.mjs'

// El guard resuelve la empresa por sesión y lee Tenant.settings: se carga aislado (vm) con
// prisma/auth/http de mentira para no tocar el cache de módulos que usan las demás pruebas.
let settings: unknown = {}
let session: { user: { tenantId: string } } | null = { user: { tenantId: 'tenant-1' } }
class InputErrorFalso extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const dependencias: Record<string, unknown> = {
  './prisma': { prisma: { tenant: { findUnique: async () => ({ settings }) } } },
  './auth': { requireSession: async () => session, requireAccountContext: async () => null },
  './http': { error: (message: string, status = 400) => Response.json({ message }, { status }), json: (data: unknown) => Response.json(data) },
  './payment-input': { InputError: InputErrorFalso },
  './modulos-catalogo.mjs': require('../lib/modulos-catalogo.mjs'),
  // La decisión por datos tiene sus propias pruebas (modulos-datos.test.ts): acá no consulta nada.
  './modulos-datos': { MODULOS_POR_DATOS: [], asegurarModulosPorDatos: async (_db: unknown, _tenantId: string, actuales: unknown) => actuales },
}
const guardPath = path.resolve(__dirname, '../lib/modulos-guard.ts')
const guardExports: Record<string, unknown> = {}
runInNewContext(ts.transpileModule(readFileSync(guardPath, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: guardExports,
  require: (name: string) => { assert.ok(Object.hasOwn(dependencias, name), `Import inesperado: ${name}`); return dependencias[name] },
  Response,
}, { filename: guardPath })
const { assertModulo, moduloGuard, moduloHabilitado, moduloApagadoMensaje } = guardExports as typeof import('../lib/modulos-guard')

const apagar = (...ids: string[]) => ({ moduleStore: { version: 2, modules: Object.fromEntries(MODULE_CATALOG.map(def => [def.id, { enabled: def.nucleo || !ids.includes(def.id) }])) } })
const conPrefijo = MODULE_CATALOG.filter(def => def.apiPrefixes.length)
const pedido = (ruta: string, method: string) => new Request(`https://api.example.test${ruta}`, { method, ...(method === 'GET' || method === 'HEAD' ? {} : { body: '{}' }) })

test('módulo apagado: la escritura da 403 y la lectura sigue en 200 en cada apiPrefix', async () => {
  assert.ok(conPrefijo.length >= 15)
  for (const def of conPrefijo) {
    for (const prefijo of def.apiPrefixes) {
      // Un módulo «implicado por» otro sigue activo mientras el otro lo esté: se apagan los dos.
      settings = apagar(def.id, ...(def.implicadoPor ?? []))
      for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const respuesta = await moduloGuard(pedido(prefijo, metodo), def.id)
        assert.equal(respuesta?.status, 403, `${metodo} ${prefijo} (${def.id} apagado)`)
        assert.match(((await respuesta!.json()) as { message: string }).message, /desactivado/)
      }
      for (const metodo of ['GET', 'HEAD', 'OPTIONS']) assert.equal(await moduloGuard(pedido(prefijo, metodo), def.id), null, `${metodo} ${prefijo} no se bloquea`)
      settings = apagar()
      assert.equal(await moduloGuard(pedido(prefijo, 'POST'), def.id), null, `POST ${prefijo} con el módulo activo`)
    }
  }
})

test('módulo apagado: empresas existentes (sin store o versión 1) siguen con todo activo y el núcleo nunca se bloquea', async () => {
  for (const legacy of [{}, undefined, { moduleStore: { version: 1, modules: {} } }]) {
    settings = legacy
    for (const def of conPrefijo) assert.equal(await moduloHabilitado('tenant-1', def.id), true, def.id)
  }
  settings = { moduleStore: { version: 2, modules: { ventas: { enabled: false }, inventario: { enabled: false } } } }
  assert.equal(await moduloHabilitado('tenant-1', 'ventas'), true)
  assert.equal(await moduloGuard(pedido('/api/orders', 'POST'), 'ventas'), null)
})

test('módulo apagado: lo apagado a mano en la versión 1 se respeta en el servidor', async () => {
  settings = { moduleStore: { version: 1, modules: { delivery: { enabled: false } } } }
  assert.equal((await moduloGuard(pedido('/api/delivery/trips', 'POST'), 'delivery'))?.status, 403)
  assert.equal(await moduloGuard(pedido('/api/gift-cards', 'POST'), 'gift-cards'), null)
})

test('assertModulo lanza 403 con mensaje claro y sin sesión el guard no decide', async () => {
  settings = apagar('tradein')
  await assert.rejects(() => assertModulo('tenant-1', 'tradein'), (cause: Error & { status?: number }) => cause.status === 403 && /Trade-In/.test(cause.message) && /desactivado/.test(cause.message))
  await assertModulo('tenant-1', 'gift-cards')
  assert.match(moduloApagadoMensaje('gift-cards'), /Gift cards/)
  session = null
  assert.equal(await moduloGuard(pedido('/api/trade-ins', 'PATCH'), 'tradein'), null)
  session = { user: { tenantId: 'tenant-1' } }
})

// ---- Cobertura: ningún apiPrefix queda sin guarda ----
const raiz = path.resolve(__dirname, '../app/api')
function* rutas(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name)
    if (entrada.isDirectory()) yield* rutas(p)
    else if (entrada.name === 'route.ts') yield p
  }
}
const MARCAS_DE_GUARDA = ['moduloGuard(', 'assertModulo(', 'deliveryAccess(']

test('cobertura: toda escritura bajo un apiPrefix tiene guarda de módulo (o exención justificada)', () => {
  const sinGuarda: string[] = []
  const exentas: string[] = []
  for (const archivo of rutas(raiz)) {
    const rel = path.relative(raiz, archivo).split(path.sep).join('/')
    const modulo = moduloDePrefijo(`/api/${path.dirname(rel)}`)
    if (!modulo) continue
    const fuente = readFileSync(archivo, 'utf8')
    const escribe = /export (async )?function (POST|PUT|PATCH|DELETE)\b/.test(fuente)
    if (!escribe) continue
    const exencion = fuente.match(/modulo-guard-exento: (.+)/)
    if (exencion) { assert.ok(exencion[1].trim().length > 10, `${rel}: la exención necesita motivo`); exentas.push(rel); continue }
    // Cada handler de escritura debe contener la guarda dentro de su cuerpo.
    const handlers = [...fuente.matchAll(/export (?:async )?function (POST|PUT|PATCH|DELETE)\b[\s\S]*?(?=\nexport (?:async )?function |\nexport const |$)/g)]
    for (const handler of handlers) {
      const guarda = MARCAS_DE_GUARDA.some(marca => handler[0].includes(marca))
      const idCorrecto = handler[0].includes(`'${modulo}'`) || handler[0].includes('deliveryAccess(')
      if (!guarda || !idCorrecto) sinGuarda.push(`${rel} ${handler[1]} (módulo ${modulo})`)
    }
  }
  assert.deepEqual(sinGuarda, [], `Escrituras sin guarda de módulo:\n${sinGuarda.join('\n')}`)
  // Las exenciones son una lista corta y revisada: públicas por token, o que reducen acceso.
  assert.ok(exentas.length <= 10, `demasiadas exenciones: ${exentas.join(', ')}`)
})

test('cobertura: cada apiPrefix del catálogo tiene al menos una ruta en backend/app/api', () => {
  const directorios = new Set<string>()
  for (const archivo of rutas(raiz)) directorios.add(`/api/${path.dirname(path.relative(raiz, archivo)).split(path.sep).join('/')}`)
  for (const def of MODULE_CATALOG) {
    for (const prefijo of def.apiPrefixes) {
      assert.ok([...directorios].some(dir => dir === prefijo || dir.startsWith(`${prefijo}/`)), `${def.id}: el prefijo ${prefijo} no coincide con ninguna ruta`)
    }
  }
})

test('cobertura: el servidor de pedidos exige el módulo para gift cards, cupones, combos, listas y trade-in', () => {
  const fuente = readFileSync(path.resolve(__dirname, '../app/api/orders/route.ts'), 'utf8')
  for (const marca of ["exigirModulo('promociones')", "exigirModulo('gift-cards')", "exigirModulo('tradein')", "moduloOn('listas-precios')"]) assert.ok(fuente.includes(marca), `orders/route.ts sin ${marca}`)
})

test('venta sin stock: con el módulo apagado el servidor rechaza backorder con 403 y mensaje claro; activo, pasa', async () => {
  settings = apagar('venta-sin-stock')
  await assert.rejects(() => assertModulo('tenant-1', 'venta-sin-stock'), (cause: Error & { status?: number }) => cause.status === 403 && /Venta sin stock/.test(cause.message) && /desactivado/.test(cause.message))
  settings = apagar()
  await assertModulo('tenant-1', 'venta-sin-stock')
  // El POST de pedidos lo exige antes de abrir la transacción, solo si alguna línea manda backorder: true.
  const fuente = readFileSync(path.resolve(__dirname, '../app/api/orders/route.ts'), 'utf8')
  assert.match(fuente, /item\.backorder === true\)\) await assertModulo\(tenant, 'venta-sin-stock'\)/)
})

test('inventario por unidades: las escrituras de unidades dan 403 apagado y las lecturas siguen', async () => {
  settings = apagar('inventario-unidades')
  for (const metodo of ['POST', 'PATCH', 'DELETE']) assert.equal((await moduloGuard(pedido('/api/inventory-units', metodo), 'inventario-unidades'))?.status, 403, metodo)
  assert.equal(await moduloGuard(pedido('/api/inventory-units', 'GET'), 'inventario-unidades'), null)
  assert.equal(moduloDePrefijo('/api/inventory-units/verify'), 'inventario-unidades')
  settings = apagar()
  assert.equal(await moduloGuard(pedido('/api/inventory-units', 'POST'), 'inventario-unidades'), null)
})

test('reservas: alcanza con stock avanzado o con inventario por unidades', async () => {
  const ids = ['stock-avanzado', 'inventario-unidades']
  settings = apagar('stock-avanzado')
  assert.equal(await moduloGuard(pedido('/api/inventory-reservations', 'POST'), ids), null)
  settings = apagar('stock-avanzado', 'inventario-unidades')
  assert.equal((await moduloGuard(pedido('/api/inventory-reservations', 'POST'), ids))?.status, 403)
  assert.equal(await moduloGuard(pedido('/api/inventory-reservations', 'GET'), ids), null)
  const fuente = readFileSync(path.resolve(__dirname, '../app/api/inventory-reservations/route.ts'), 'utf8')
  assert.ok(fuente.includes("['stock-avanzado', 'inventario-unidades']"))
})
