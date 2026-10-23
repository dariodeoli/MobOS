import test from 'node:test'
import assert from 'node:assert/strict'
import { dependenciesEnabled, hasEnabledDependents, MODULE_CATALOG, MODULE_KINDS, mergeModuleStoreSettings, moduleStoreFrom, newCompanyModuleStore, newCompanySettings, parseModuleChange, updateModuleStore } from '../lib/module-store'
import { moduloActivo } from '../lib/modulos-catalogo.mjs'

test('tienda de módulos: el estado inicial conserva funciones existentes y fuerza los módulos core', () => {
  const state = moduleStoreFrom({ keepMe: true }, '2026-10-17T10:00:00.000Z')
  assert.equal(state.modules.agenda.enabled, true)
  assert.equal(state.modules.clientes.enabled, true)
  assert.equal(state.modules.servicios.enabled, true)
  assert.equal(state.modules.equipo.enabled, true)
  assert.equal(state.modules.inventario.enabled, true)
  assert.equal(state.modules.inventario.source, 'preset')
  assert.equal(state.modules.delivery.enabled, true)
  assert.equal(state.modules.delivery.source, 'preset')
  assert.equal(state.modules['verificacion-imei'].enabled, true)
  assert.equal(state.modules['portal-clientes'].enabled, true)
  assert.equal(state.modules.publicidad.enabled, true)
  assert.equal(state.modules.asistentes.enabled, false)
  assert.equal(state.modules.facturacion.enabled, false)
  assert.equal(state.modules.autofacturacion.enabled, false)
  assert.equal(state.modules['facturacion-electronica'].enabled, false)
  assert.equal(state.modules.salud.enabled, false)
})

test('tienda de módulos: preset escribe defaults por rubro y conserva formato de override manual', () => {
  let state = updateModuleStore({}, { preset: 'servicios' }, '2026-10-17T10:00:00.000Z')
  assert.equal(state.preset, 'servicios')
  assert.equal(state.modules.servicios.enabled, true)
  assert.equal(state.modules.inventario.enabled, true)
  assert.equal(state.version, 2)
  assert.equal(state.modules.mensajes.enabled, true)
  assert.equal(state.modules.delivery.enabled, true)
  assert.equal(state.modules.reportes.enabled, true)
  state = updateModuleStore({ moduleStore: state }, { moduleId: 'tradein', enabled: false }, '2026-10-17T10:01:00.000Z')
  assert.equal(state.modules.tradein.enabled, false)
  assert.equal(state.modules.tradein.manuallySelected, true)
  assert.equal(state.modules.tradein.source, 'manual')
  assert.equal(state.modules.tradein.updatedAt, '2026-10-17T10:01:00.000Z')
})

test('tienda de módulos: respeta dependencias, core y estados próximamente', () => {
  assert.throws(() => updateModuleStore({}, { moduleId: 'clientes', enabled: false }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.throws(() => updateModuleStore({}, { moduleId: 'salud', enabled: true }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.throws(() => updateModuleStore({}, { moduleId: 'ventas', enabled: false }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.throws(() => updateModuleStore({}, { moduleId: 'impresion', enabled: false }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.throws(() => updateModuleStore({}, { moduleId: 'mensajes', enabled: false }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.throws(() => updateModuleStore({}, { moduleId: 'inventario', enabled: false }), /MODULE_CHANGE_NOT_ALLOWED/)
  assert.equal(MODULE_CATALOG.find(module => module.id === 'verificacion-imei')?.changeable, true)
  assert.equal(MODULE_CATALOG.find(module => module.id === 'delivery')?.changeable, true)
  assert.deepEqual(MODULE_CATALOG.find(module => module.id === 'delivery')?.dependencies, ['clientes', 'ventas'])
  assert.deepEqual(MODULE_CATALOG.find(module => module.id === 'verificacion-imei')?.dependencies, ['inventario'])
  assert.equal(MODULE_CATALOG.find(module => module.id === 'delivery')?.changeable, true)
  assert.ok(MODULE_CATALOG.find(module => module.id === 'delivery')?.capabilities.includes('Cierre semanal por sucursal'))
  assert.ok(MODULE_CATALOG.find(module => module.id === 'delivery')?.capabilities.includes('Cierre diario'))
  assert.ok(MODULE_CATALOG.find(module => module.id === 'verificacion-imei')?.capabilities.includes('IMEI.info · próximamente / no configurado'))
  assert.ok(MODULE_CATALOG.find(module => module.id === 'impresion')?.packs?.length)
  assert.ok(MODULE_CATALOG.find(module => module.id === 'mensajes')?.packs?.length)
  assert.equal(MODULE_CATALOG.find(module => module.id === 'portal-clientes')?.status, 'available')
  assert.equal(MODULE_CATALOG.find(module => module.id === 'portal-clientes')?.changeable, true)
  assert.ok(MODULE_CATALOG.every(module => MODULE_KINDS.includes(module.kind)))
  assert.equal(MODULE_CATALOG.find(module => module.id === 'publicidad')?.status, 'available')
  assert.equal(MODULE_CATALOG.find(module => module.id === 'asistentes')?.status, 'coming-soon')
  assert.equal(MODULE_CATALOG.find(module => module.id === 'facturacion')?.status, 'coming-soon')
  assert.equal(MODULE_CATALOG.find(module => module.id === 'autofacturacion')?.status, 'coming-soon')
  assert.equal(MODULE_CATALOG.find(module => module.id === 'facturacion-electronica')?.status, 'coming-soon')
  assert.deepEqual(MODULE_CATALOG.find(module => module.id === 'autofacturacion')?.dependencies, ['ventas'])
  assert.ok(MODULE_CATALOG.find(module => module.id === 'facturacion-electronica')?.capabilities.includes('SIFEN y KuDE'))
  assert.equal(new Set(MODULE_CATALOG.map(module => module.id)).size, MODULE_CATALOG.length)
  const catalog = [{ id: 'clientes', dependencies: [] }, { id: 'pedidos', dependencies: ['clientes'] }]
  const modules = { clientes: { enabled: false }, pedidos: { enabled: true } }
  assert.equal(dependenciesEnabled(catalog[1].dependencies, modules), false)
  assert.equal(hasEnabledDependents('clientes', catalog, modules), true)
})

test('tienda de módulos: parser acepta solo cambios conocidos y merge conserva los demás ajustes', () => {
  assert.deepEqual(parseModuleChange({ moduleId: 'inventario', enabled: false }), { moduleId: 'inventario', enabled: false })
  assert.deepEqual(parseModuleChange({ moduleId: 'tradein', enabled: true }), { moduleId: 'tradein', enabled: true })
  assert.equal(parseModuleChange({ moduleId: 'desconocido', enabled: true }), null)
  assert.equal(parseModuleChange({ preset: 'otro', extra: true }), null)
  const next = updateModuleStore({ keepMe: true }, { moduleId: 'comparador', enabled: false })
  assert.deepEqual(mergeModuleStoreSettings({ keepMe: true, other: 2 }, next), { keepMe: true, other: 2, moduleStore: next })
  assert.ok(MODULE_CATALOG.every(module => module.status === 'available' || module.status === 'coming-soon'))
})

test('tienda de módulos v2: empresa existente (sin store o versión 1) conserva todo activo y respeta lo apagado a mano', () => {
  for (const settings of [undefined, {}, { moduleStore: { version: 1, preset: 'comercio', modules: {} } }]) {
    const state = moduleStoreFrom(settings, '2026-10-21T10:00:00.000Z')
    assert.equal(state.version, 2)
    // «Catálogo de modelos» no se guarda prendido: se deriva de Trade-In (implicadoPor), ver más abajo.
    for (const module of MODULE_CATALOG) assert.equal(state.modules[module.id].enabled, module.status === 'available' && module.id !== 'catalogo-modelos', module.id)
  }
  const v1 = { moduleStore: { version: 1, preset: 'comercio', modules: { delivery: { enabled: false, source: 'manual', manuallySelected: true, updatedAt: '2026-10-01T00:00:00.000Z' }, mensajes: { enabled: false } } } }
  const state = moduleStoreFrom(v1)
  assert.equal(state.modules.delivery.enabled, false)
  assert.equal(state.modules.delivery.source, 'manual')
  assert.equal(state.modules.delivery.updatedAt, '2026-10-01T00:00:00.000Z')
  assert.equal(state.modules.mensajes.enabled, true)
  assert.equal(state.modules['campanas-mensajes'].enabled, false)
  assert.equal(state.modules['campanas-recompra'].enabled, false)
  assert.equal(state.modules.servicios.enabled, true)
})

test('tienda de módulos v2: empresa nueva guarda núcleo más defaultNuevo y un módulo agregado después no se prende solo', () => {
  const nuevo = newCompanyModuleStore('2026-10-21T10:00:00.000Z')
  assert.equal(nuevo.version, 2)
  for (const module of MODULE_CATALOG) assert.equal(nuevo.modules[module.id].enabled, module.nucleo || module.defaultNuevo, module.id)
  assert.equal(nuevo.modules.servicios.enabled, false)
  assert.equal(nuevo.modules.ventas.enabled, true)
  const sinTradein = { ...nuevo, modules: { ...nuevo.modules } }
  delete (sinTradein.modules as Record<string, unknown>).tradein
  assert.equal(moduleStoreFrom({ moduleStore: sinTradein }).modules.tradein.enabled, false)
  // Activar un módulo desde cero persiste el estado completo en versión 2.
  const next = updateModuleStore({ moduleStore: nuevo }, { moduleId: 'servicios', enabled: true })
  assert.equal(next.version, 2)
  assert.equal(next.modules.servicios.enabled, true)
  assert.equal(next.modules.delivery.enabled, false)
})

test('tienda de módulos v2: dependencias entre módulos opcionales', () => {
  const nuevo = newCompanyModuleStore()
  const conImpresionPro = updateModuleStore({ moduleStore: nuevo }, { moduleId: 'impresion-pro', enabled: true })
  assert.equal(conImpresionPro.modules['impresion-pro'].enabled, true)
  assert.equal(MODULE_CATALOG.filter(module => module.nucleo).every(module => moduleStoreFrom({ moduleStore: { version: 2, modules: { [module.id]: { enabled: false } } } }).modules[module.id].enabled), true)
})

test('tienda de módulos v2: los settings de una empresa nueva traen el store y conservan el resto', () => {
  const settings = newCompanySettings({ onboarding: { adminPinPending: true } }, '2026-10-21T10:00:00.000Z') as Record<string, any>
  assert.deepEqual(settings.onboarding, { adminPinPending: true })
  assert.equal(settings.moduleStore.version, 2)
  assert.equal(settings.moduleStore.modules.servicios.enabled, false)
  assert.equal(settings.moduleStore.modules.ventas.enabled, true)
})

test('Catálogo de modelos: se activa solo con Trade-In y no bloquea apagarlo', () => {
  const def = MODULE_CATALOG.find(module => module.id === 'catalogo-modelos')!
  assert.deepEqual([...def.dependencies], ['tradein'])
  assert.deepEqual([...(def.implicadoPor ?? [])], ['tradein'])
  const conTradein = { moduleStore: { version: 2, preset: 'comercio', modules: { tradein: { enabled: true } } } }
  const sinTradein = { moduleStore: { version: 2, preset: 'comercio', modules: { tradein: { enabled: false } } } }
  assert.equal(moduloActivo(conTradein, 'catalogo-modelos'), true)
  assert.equal(moduloActivo(sinTradein, 'catalogo-modelos'), false)
  const apagado = updateModuleStore(conTradein, { moduleId: 'tradein', enabled: false }, '2026-10-23T10:00:00.000Z')
  assert.equal(apagado.modules.tradein.enabled, false, 'apagar Trade-In no queda bloqueado por el catálogo')
})
