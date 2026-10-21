import test from 'node:test'
import assert from 'node:assert/strict'
import { MODULE_CATALOG, moduloActivo, moduloDeVista, vistaActiva } from './modulos.js'
import { nuevoModuleStore, moduloDePrefijo } from '../../backend/lib/modulos-catalogo.mjs'

const NUCLEO = MODULE_CATALOG.filter(m => m.nucleo).map(m => m.id)
const OPCIONALES = MODULE_CATALOG.filter(m => m.changeable).map(m => m.id)

test('moduloActivo: el núcleo siempre está activo, aunque el store diga lo contrario', () => {
  const apagado = { moduleStore: { version: 2, modules: Object.fromEntries(NUCLEO.map(id => [id, { enabled: false }])) } }
  for (const id of NUCLEO) assert.equal(moduloActivo(apagado, id), true, id)
  for (const id of ['ventas', 'inventario', 'finanzas', 'reportes', 'clientes', 'impresion', 'mensajes']) assert.ok(NUCLEO.includes(id), id)
})

test('moduloActivo: sin datos o con versión 1, todo módulo disponible queda activo (default legacy)', () => {
  for (const fuente of [undefined, null, {}, { moduleStore: { version: 1, preset: 'comercio', modules: {} } }, { settings: {} }]) {
    for (const id of OPCIONALES) assert.equal(moduloActivo(fuente, id), true, `${id} con ${JSON.stringify(fuente)}`)
  }
  assert.equal(moduloActivo({}, 'salud'), false)
  assert.equal(moduloActivo({}, 'asistentes'), false)
})

test('moduloActivo: lo apagado a mano en la versión 1 se respeta', () => {
  const v1 = { moduleStore: { version: 1, modules: { delivery: { enabled: false }, 'verificacion-imei': { enabled: false }, mensajes: { enabled: false } } } }
  assert.equal(moduloActivo(v1, 'delivery'), false)
  assert.equal(moduloActivo(v1, 'verificacion-imei'), false)
  assert.equal(moduloActivo(v1, 'servicios'), true)
  // mensajes es núcleo: las plantillas vuelven, pero los envíos masivos y la recompra siguen apagados.
  assert.equal(moduloActivo(v1, 'mensajes'), true)
  assert.equal(moduloActivo(v1, 'campanas-mensajes'), false)
  assert.equal(moduloActivo(v1, 'campanas-recompra'), false)
})

test('moduloActivo: una empresa nueva tiene solo el núcleo más defaultNuevo', () => {
  const nuevo = { moduleStore: nuevoModuleStore('2026-10-21T00:00:00.000Z') }
  for (const id of NUCLEO) assert.equal(moduloActivo(nuevo, id), true, id)
  for (const def of MODULE_CATALOG.filter(m => !m.nucleo)) assert.equal(moduloActivo(nuevo, def.id), def.defaultNuevo, def.id)
  assert.equal(moduloActivo(nuevo, 'servicios'), false)
  assert.equal(moduloActivo(nuevo, 'delivery'), false)
  assert.equal(moduloActivo(nuevo, 'portal-clientes'), true)
})

test('moduloActivo: en versión 2 un módulo agregado después no se prende solo', () => {
  const v2 = { moduleStore: { version: 2, modules: { delivery: { enabled: true } } } }
  assert.equal(moduloActivo(v2, 'delivery'), true)
  assert.equal(moduloActivo(v2, 'tradein'), false)
})

test('moduloActivo: la demo ve todo activo y acepta tenant, store o respuesta de la API', () => {
  const apagado = { demo: true, moduleStore: { version: 2, modules: {} } }
  for (const id of MODULE_CATALOG.map(m => m.id)) assert.equal(moduloActivo(apagado, id), true, id)
  assert.equal(moduloActivo({ moduleStore: { version: 2, modules: {} } }, 'tradein', { demo: true }), true)
  const respuesta = { catalog: [], state: { version: 2, modules: { tradein: { enabled: true }, servicios: { enabled: false } } } }
  assert.equal(moduloActivo(respuesta, 'tradein'), true)
  assert.equal(moduloActivo(respuesta, 'servicios'), false)
  assert.equal(moduloActivo({ version: 2, modules: { servicios: { enabled: false } } }, 'servicios'), false)
  assert.equal(moduloActivo({ settings: { moduleStore: { version: 2, modules: { servicios: { enabled: false } } } } }, 'servicios'), false)
})

test('moduloActivo: un id que no es módulo no se oculta', () => {
  assert.equal(moduloActivo({ moduleStore: { version: 2, modules: {} } }, 'cualquier-cosa'), true)
})

test('catálogo: ids únicos, dependencias y prefijos coherentes', () => {
  const ids = MODULE_CATALOG.map(m => m.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const def of MODULE_CATALOG) {
    for (const dep of def.dependencies) assert.ok(ids.includes(dep), `${def.id} depende de ${dep}`)
    for (const campo of ['navIds', 'tabIds', 'apiPrefixes', 'dependencies']) assert.ok(Array.isArray(def[campo]), `${def.id}.${campo}`)
    assert.equal(typeof def.defaultLegacy, 'boolean')
    assert.equal(typeof def.defaultNuevo, 'boolean')
    if (def.nucleo) assert.equal(def.changeable, false, def.id)
    // Un módulo de núcleo nunca depende de uno opcional.
    if (def.nucleo) for (const dep of def.dependencies) assert.ok(NUCLEO.includes(dep), `${def.id} -> ${dep}`)
    // defaultNuevo implica que sus dependencias también arrancan activas.
    if (def.defaultNuevo) for (const dep of def.dependencies) assert.ok(MODULE_CATALOG.find(m => m.id === dep).defaultNuevo, `${def.id} -> ${dep}`)
  }
  assert.equal(moduloDePrefijo('/api/marketing/campaigns'), 'campanas-recompra')
  assert.equal(moduloDePrefijo('/api/marketing/otra'), 'publicidad')
  assert.equal(moduloDePrefijo('/api/orders'), null)
})

test('moduloDeVista / vistaActiva: ocultan solo vistas de módulos apagados', () => {
  const apagado = { moduleStore: { version: 2, modules: { servicios: { enabled: false }, delivery: { enabled: true } } } }
  assert.equal(moduloDeVista('servicio'), 'servicios')
  assert.equal(moduloDeVista('cargar'), null)
  assert.equal(vistaActiva(apagado, 'servicio'), false)
  assert.equal(vistaActiva(apagado, 'repartos'), true)
  assert.equal(vistaActiva(apagado, 'cargar'), true)
  assert.equal(vistaActiva({ ...apagado, demo: true }, 'servicio'), true)
})
