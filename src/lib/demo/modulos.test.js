import test from 'node:test'
import assert from 'node:assert/strict'
import { leerFuente } from '../fuenteStock.js'
import { MODULE_CATALOG, moduloActivo } from '../modulos.js'
import { estadoDemoModulos, VISTAS_DEMO } from './modulos.js'
import { vistaDeRuta } from '../rutas.js'
import { ORDEN_GRUPOS_CONFIG } from '../../components/control/config/gruposConfig.js'

const panel = leerFuente(new URL('../../pages/PanelVendedor.jsx', import.meta.url), 'utf8')
const tabsDe = nombre => [...panel.split(`const ${nombre} = [`)[1].split('\n]\n')[0].matchAll(/\['([^']+)', '[^']+'\]/g)].map(m => m[1])
const SUBPAGINAS = { stock: tabsDe('TABS_INVENTARIO'), finanzas: tabsDe('TABS_FINANZAS'), analisis: tabsDe('TABS_ANALISIS'), configuracion: ORDEN_GRUPOS_CONFIG }
const ownerNav = [...panel.split('const OWNER_NAV = [')[1].split('\n]\n')[0].matchAll(/\['([^']+)', '[^']+', '[^']+'\]/g)].map(m => m[1])

test('demo: moduloActivo da true para todo el catálogo, con o sin estado guardado', () => {
  const apagado = { demo: true, moduleStore: { version: 2, modules: Object.fromEntries(MODULE_CATALOG.map(m => [m.id, { enabled: false }])) } }
  for (const def of MODULE_CATALOG) assert.equal(moduloActivo(apagado, def.id), true, def.id)
  assert.equal(moduloActivo({ demo: true }, 'servicios'), true)
})

test('demo: la pantalla Módulos recibe datos ficticios con todo lo disponible activo', () => {
  const datos = estadoDemoModulos()
  assert.equal(datos.demo, true)
  assert.equal(datos.catalog.length, MODULE_CATALOG.length)
  for (const def of MODULE_CATALOG) assert.equal(datos.state.modules[def.id].enabled, def.nucleo || def.status === 'available', def.id)
})

test('coherencia: cada navId y tabId del catálogo tiene una vista en la demo', () => {
  for (const def of MODULE_CATALOG) {
    for (const id of [...def.navIds, ...def.tabIds]) {
      assert.ok(VISTAS_DEMO[id], `${def.id}: «${id}» no tiene vista demo`)
      const [, primero, segundo] = VISTAS_DEMO[id].split('/')
      if (SUBPAGINAS[primero]) {
        if (segundo) assert.ok(SUBPAGINAS[primero].includes(segundo), `${id}: la pestaña ${primero}/${segundo} no existe`)
      } else {
        assert.ok(vistaDeRuta(primero, { esOwner: true }), `${id}: la ruta ${VISTAS_DEMO[id]} no resuelve a una vista`)
      }
    }
  }
})

test('coherencia: el dueño de la demo alcanza todas las vistas de módulos con ítem de menú', () => {
  for (const id of ['repartos', 'tradein-admin', 'servicio', 'campanas', 'promociones', 'precios', 'celulares', 'comparador', 'centro-control', 'abastecimiento', 'traslados'])
    assert.ok(ownerNav.includes(id), `${id} en el menú del dueño`)
})
