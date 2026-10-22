import test from 'node:test'
import assert from 'node:assert/strict'
import { asegurarModulosPorDatos, MODULOS_POR_DATOS, modulosPendientesPorDatos } from '../lib/modulos-datos'
import { moduleStoreFrom, updateModuleStore } from '../lib/module-store'
import { moduloActivo, nuevoModuleStore } from '../lib/modulos-catalogo.mjs'

// Defaults por empresa de «Inventario por unidades» y «Venta sin stock»:
// existentes se deciden por sus datos (una sola vez), nuevas arrancan apagadas.
type Datos = { unidades: boolean; sobrePedido: boolean }
function baseEnMemoria(settingsInicial: unknown, datos: Datos) {
  const estado = { settings: settingsInicial, consultas: 0, escrituras: 0, auditoria: [] as string[] }
  const tx = {
    $queryRaw: async () => [],
    tenant: {
      findUnique: async () => ({ settings: estado.settings }),
      update: async ({ data }: { data: { settings: unknown } }) => { estado.escrituras += 1; estado.settings = data.settings },
    },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { estado.auditoria.push(data.action) } },
  }
  const db = {
    inventoryUnit: { findFirst: async () => { estado.consultas += 1; return datos.unidades ? { id: 'u1' } : null } },
    orderItem: { findFirst: async () => { estado.consultas += 1; return datos.sobrePedido ? { id: 'i1' } : null } },
    tenant: { findUnique: async () => ({ settings: estado.settings }) },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  }
  return { db, estado }
}

test('porDatos: son exactamente inventario-unidades y venta-sin-stock', () => {
  assert.deepEqual([...MODULOS_POR_DATOS].sort(), ['inventario-unidades', 'venta-sin-stock'])
})

test('empresa existente con unidades y sin backorder: unidades activo, venta sin stock apagado', async () => {
  const { db, estado } = baseEnMemoria(null, { unidades: true, sobrePedido: false })
  const settings = await asegurarModulosPorDatos(db as never, 't1')
  assert.equal(moduloActivo({ settings }, 'inventario-unidades'), true)
  assert.equal(moduloActivo({ settings }, 'venta-sin-stock'), false)
  assert.equal(moduloActivo({ settings }, 'tradein'), true, 'el resto sigue con el default legacy')
  assert.deepEqual(estado.auditoria, ['TENANT_MODULES_AUTODETECTED'])
})

test('empresa existente sin unidades y con backorder histórico: unidades apagado, venta sin stock activo', async () => {
  const { db } = baseEnMemoria({ moduleStore: { version: 1, preset: 'comercio', modules: { delivery: { enabled: false } } } }, { unidades: false, sobrePedido: true })
  const settings = await asegurarModulosPorDatos(db as never, 't1')
  assert.equal(moduloActivo({ settings }, 'inventario-unidades'), false)
  assert.equal(moduloActivo({ settings }, 'venta-sin-stock'), true)
  assert.equal(moduloActivo({ settings }, 'delivery'), false, 'lo apagado a mano se respeta')
})

test('se decide una sola vez: la segunda llamada no consulta ni escribe, aunque cambien los datos', async () => {
  const datos = { unidades: false, sobrePedido: false }
  const { db, estado } = baseEnMemoria({}, datos)
  await asegurarModulosPorDatos(db as never, 't1')
  const consultas = estado.consultas
  datos.unidades = true
  const settings = await asegurarModulosPorDatos(db as never, 't1')
  assert.equal(estado.consultas, consultas)
  assert.equal(estado.escrituras, 1)
  assert.equal(moduloActivo({ settings }, 'inventario-unidades'), false)
})

test('empresa nueva (versión 2): apagados y sin consultas; una elección manual no se pisa', async () => {
  const nueva = { moduleStore: nuevoModuleStore() }
  assert.equal(moduloActivo(nueva, 'inventario-unidades'), false)
  assert.equal(moduloActivo(nueva, 'venta-sin-stock'), false)
  assert.deepEqual(modulosPendientesPorDatos(nueva), [])
  const { db, estado } = baseEnMemoria(nueva, { unidades: true, sobrePedido: true })
  await asegurarModulosPorDatos(db as never, 't1')
  assert.equal(estado.consultas, 0)
  assert.equal(estado.escrituras, 0)
})

test('un preset no cambia estos módulos y abastecimiento queda visible si está activo venta sin stock', () => {
  const settings = { moduleStore: nuevoModuleStore() }
  const activado = updateModuleStore(settings, { moduleId: 'venta-sin-stock', enabled: true })
  assert.equal(moduloActivo({ settings: { moduleStore: activado } }, 'venta-sin-stock'), true)
  const conPreset = updateModuleStore({ moduleStore: activado }, { preset: 'servicios' })
  assert.equal(moduleStoreFrom({ moduleStore: conPreset }).modules['venta-sin-stock'].enabled, true)
  // abastecimiento apagado + venta-sin-stock activo: sigue habilitado; con ambos apagados, no.
  const abastecimientoOff = updateModuleStore({ moduleStore: activado }, { moduleId: 'abastecimiento', enabled: false })
  assert.equal(moduloActivo({ moduleStore: abastecimientoOff }, 'abastecimiento'), true)
  const ambosOff = updateModuleStore({ moduleStore: abastecimientoOff }, { moduleId: 'venta-sin-stock', enabled: false })
  assert.equal(moduloActivo({ moduleStore: ambosOff }, 'abastecimiento'), false)
})
