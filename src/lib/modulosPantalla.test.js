import test from 'node:test'
import assert from 'node:assert/strict'
import { MODULE_CATALOG } from './modulos.js'
import { nuevoModuleStore } from '../../backend/lib/modulos-catalogo.mjs'
import { avisoModuloApagado, rutaPadreDeVista, textoModuloDesactivado } from './modulosAviso.js'
import { FILTROS_MODULOS, INCLUYE, dependenciasFaltantes, dependientesActivos, filtrarModulos, grupoDeModulo, hrefConfigurar, modulosOpcionales } from './modulosPantalla.js'

const nuevo = () => ({ state: nuevoModuleStore('2026-10-21T00:00:00.000Z') })
const conActivos = (...ids) => { const f = nuevo(); for (const id of ids) f.state.modules[id] = { enabled: true }; return f }

test('la lista no muestra el núcleo y cada módulo cae en una pestaña del filtro', () => {
  const opcionales = modulosOpcionales()
  assert.ok(opcionales.length > 15)
  assert.ok(opcionales.every(def => !def.nucleo))
  const validos = new Set(FILTROS_MODULOS.map(([id]) => id))
  for (const def of opcionales) assert.ok(validos.has(grupoDeModulo(def.id)), def.id)
  assert.equal(filtrarModulos(nuevo(), 'todos').length, opcionales.length)
})

test('Activos muestra solo lo prendido; los grupos filtran por área', () => {
  const fuente = conActivos('delivery', 'cuotas')
  const activos = filtrarModulos(fuente, 'activos').map(def => def.id)
  assert.ok(activos.includes('delivery') && activos.includes('cuotas') && activos.includes('portal-clientes'))
  assert.ok(!activos.includes('servicios'))
  assert.deepEqual(filtrarModulos(fuente, 'finanzas').map(def => def.id).sort(), ['comisiones', 'conciliacion', 'cuotas'])
  assert.ok(filtrarModulos(fuente, 'stock').every(def => ['listas-precios', 'comparador', 'abastecimiento', 'multisucursal', 'stock-avanzado'].includes(def.id)))
})

test('dependencias: informa qué falta para activar y qué depende de un módulo activo', () => {
  const abastecimiento = MODULE_CATALOG.find(def => def.id === 'abastecimiento')
  assert.deepEqual(dependenciasFaltantes(abastecimiento, nuevo()), [])
  const sinInventario = { state: { version: 2, modules: { inventario: { enabled: false } } } }
  // El núcleo no se puede apagar: sus dependientes nunca quedan bloqueados por él.
  assert.deepEqual(dependenciasFaltantes(abastecimiento, sinInventario), [])
  const campanas = MODULE_CATALOG.find(def => def.id === 'campanas-recompra')
  assert.deepEqual(dependientesActivos(campanas, conActivos('campanas-recompra')), [])
})

test('textos de producto: sin jerga interna y con detalle de lo que incluye', () => {
  for (const def of modulosOpcionales().filter(d => d.status === 'available')) assert.ok(INCLUYE[def.id]?.length, `${def.id} sin «qué incluye»`)
  const textos = JSON.stringify([INCLUYE, textoModuloDesactivado('delivery')])
  for (const interno of ['Solo catálogo', 'Control pendiente', 'catalogOnly', 'guardas de servidor']) assert.ok(!textos.includes(interno), interno)
  assert.equal(hrefConfigurar(MODULE_CATALOG.find(d => d.id === 'portal-clientes')), '/configuracion/negocio?org=portal')
})

test('aviso de módulo apagado: texto, módulo y vista padre', () => {
  assert.equal(avisoModuloApagado('repartos'), 'El módulo Delivery externo está desactivado.')
  assert.equal(avisoModuloApagado('conteos'), 'El módulo Control de stock avanzado está desactivado.')
  assert.equal(avisoModuloApagado('pedidos'), null)
  assert.equal(rutaPadreDeVista('repartos'), '/pedidos')
  assert.equal(rutaPadreDeVista('conciliacion'), '/finanzas/caja')
  assert.equal(rutaPadreDeVista('taller'), '/stock/unidades')
  // Cada vista y pestaña de módulo vuelve a una ruta padre que no es un módulo.
  for (const def of MODULE_CATALOG.filter(d => !d.nucleo)) {
    for (const id of [...def.navIds, ...def.tabIds]) {
      const ruta = rutaPadreDeVista(id)
      assert.match(ruta, /^\//, id)
      assert.notEqual(ruta, `/${id}`, `${id} no vuelve a sí misma`)
    }
  }
})
