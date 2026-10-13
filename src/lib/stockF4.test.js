import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { gs, formatUsd } from '../utils/calculos.js'
import {
  costoEnGs,
  sinCostoUnitario,
  sigueEnInventario,
  estadoInventario,
} from '../utils/inventario.js'
import { fuenteStock } from './fuenteStock.js'

// El inventario vive en src/components/stock/: cada pieza se lee de su archivo
// y `source` junta toda la pantalla para las comprobaciones globales.
const leer = (nombre) => readFileSync(`src/components/stock/${nombre}`, 'utf8')
const source = fuenteStock()
const hook = leer('useStockControl.js')
const helpers = leer('stockHelpers.js')
const filas = leer('FilaStock.jsx')
const tarjetas = leer('TarjetaStockMovil.jsx')
const menuAcciones = leer('MenuAcciones.jsx')
const between = (s, start, end) => {
  const a = s.indexOf(start)
  const b = s.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `${start} → ${end}`)
  return s.slice(a, b)
}
// Texto de una función de primer nivel: desde `function nombre(` hasta la
// siguiente declaración exportada (o el final del archivo).
const funcion = (s, nombre) => {
  const a = s.indexOf(`function ${nombre}(`)
  assert.ok(a >= 0, nombre)
  const siguiente = s.slice(a + 1).search(/\n(export |function |const [A-Za-z]+ = )/)
  return siguiente < 0 ? s.slice(a) : s.slice(a, a + 1 + siguiente)
}

test('Stock business, role, store, sorting, selection and printing logic stays in the control hook', () => {
  // La lógica de negocio (roles, almacén, orden, selección, impresión y venta)
  // sigue en un solo hook; las pestañas solo la consumen.
  for (const texto of [
    'prepararVentaDesdeInventario',
    "unit.status === 'AVAILABLE'",
    'resources.inventoryUnits.verify',
    'resources.inventoryUnits.update',
    'resources.inventoryReservations.create',
    'resources.transfers.create',
    'setAndRefresh',
    'canViewAlerts',
    'canManageLocations',
    'canManageVisibility',
    'puedeTransferirSinAuth',
    'puedeAplicarConteo',
    "sesion?.rol === 'GERENTE'",
    'refrescarCatalogo',
  ])
    assert.ok(hook.includes(texto), texto)
  // Las pestañas no hacen su propio acceso a datos de inventario: reciben ctx.
  for (const nombre of ['TabReservas', 'TabTraslados', 'TabUbicaciones', 'TabAlertas', 'TabCompartido', 'TabConteos', 'TabTaller', 'TabAutorizaciones', 'TabTransito']) {
    const archivo = leer(`${nombre}.jsx`)
    assert.ok(archivo.includes('({ ctx })'), `${nombre} recibe el contexto del hook`)
    assert.ok(!archivo.includes('resources.'), `${nombre} no consulta recursos por su cuenta`)
  }
  assert.ok(tarjetas.includes('function TarjetaUnidad('))
  assert.ok(leer('AccionesUnidad.jsx').includes('<Modal open={receiveOpen}'), 'la carga rápida sigue como diálogo')
  assert.ok(Buffer.byteLength(readFileSync('src/components/control/Inventario.jsx', 'utf8')) < 400, 'Inventario.jsx es solo un re-export')
  assert.match(readFileSync('src/components/control/Inventario.jsx', 'utf8'), /export \{ default \} from '@\/components\/stock\/StockShell'/)
})

test('Stock frontend spec keeps every previous case and assertion', () => {
  // Intención del candado histórico: la suite de navegación no pierde casos ni
  // aserciones. Los casos de Stock cambian de URL/selectores, no se borran.
  const spec = readFileSync('e2e/frontend/nav-v2.frontend.spec.js', 'utf8')
  const casos = spec.match(/^\s*test\(/gm) || []
  const aserciones = spec.match(/expect\(/g) || []
  assert.ok(casos.length >= 39, `casos: ${casos.length}`)
  assert.ok(aserciones.length >= 514, `aserciones: ${aserciones.length}`)
  assert.ok(!/\.(skip|fixme|only)\(/.test(spec), 'sin casos saltados')
  assert.ok(spec.includes("toContainText('Resumen de tienda no disponible')"), 'el aviso de Clientes se sigue verificando')
})

test('Stock preserves missing costs, zero costs, USD conversion and delivery availability', () => {
  assert.equal(sinCostoUnitario({}), true)
  assert.equal(sinCostoUnitario({ originalCost: 0 }), false)
  assert.equal(
    costoEnGs({ originalCost: 719, costCurrency: 'USD', exchangeRatePyg: 7300 }),
    5248700,
  )
  assert.equal(costoEnGs({ costPyg: 100000000, costCurrency: 'PYG' }), 100000000)
  assert.equal(
    sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }),
    true,
  )
  assert.equal(
    sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'DELIVERED' } }),
    false,
  )
  assert.equal(
    estadoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }).label,
    'Listo p/ retirar',
  )
  assert.ok(helpers.includes('costoGs / cotizacion'))
  assert.ok(helpers.includes("currency === 'USD' && original !== null"))
})
test('Stock required identity is not truncated and physical actor is never abbreviated', () => {
  const rows = funcion(filas, 'FilaUnidad')
  assert.ok(rows.includes('v.quien'))
  assert.ok(rows.includes('fechaVerificacionCorta(unit.lastVerifiedAt)'))
  assert.ok(!rows.includes('inicialesNombre'))
  assert.ok(!rows.includes('fechaVerificacionDia'))
  assert.ok(!rows.includes('locksParaChips'))
  assert.ok(!rows.includes('min-w-[3rem] truncate'))
  assert.ok(rows.includes('unit.batteryHealth'))
  assert.ok(rows.includes('unit.color || unit.product?.color'))
})
test('Stock menu and row keyboard handlers remain local and preserve callback identity', () => {
  const menu = menuAcciones
  for (const key of ['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'])
    assert.ok(menu.includes(key))
  for (const text of [
    'aria-haspopup="menu"',
    'aria-expanded={abierto}',
    'role="menuitem"',
    'trigger.current?.focus()',
    'accion.run()',
  ])
    assert.ok(menu.includes(text))
  assert.ok(filas.includes('event.target === event.currentTarget'))
  const callbacks = [
    'onVerify',
    'onSell',
    'onReserve',
    'onLabel',
    'onAdjust',
    'onRemove',
    'onMove',
    'onEdit',
    'onCosto',
    'onComprobante',
    'onApartar',
    'onLiberarApartado',
  ]
  const row = funcion(filas, 'FilaUnidad')
  for (const callback of callbacks) assert.ok(row.includes(callback), callback)
})
test('Stock grid is shared with loading/header, scoped cards retain touch and full amounts', () => {
  const css = readFileSync('src/components/stock/stockF4.css', 'utf8')
  for (const text of [
    '@container',
    'min-height: 44px',
    'overflow-wrap: anywhere',
    'rgb(var(--c-ink))',
  ])
    assert.ok(css.includes(text))
  assert.ok(!css.includes('.shell-'))
  assert.ok(!css.includes('text-overflow: ellipsis'))
  assert.ok(!source.includes('min-w-[60rem]'))
  assert.ok(source.includes('Costo (USD)'))
  assert.equal(source.match(/\$\{UNIDADES_GRID\}/g).length, 3)
})

// Execute the actual local display derivation without importing React or its API graph.
function displayedCost(unit, cotizacion, mobile = false) {
  const row = mobile ? funcion(tarjetas, 'TarjetaUnidadMovil') : funcion(filas, 'FilaUnidad')
  const start =
    row.indexOf('  const costoGs =') >= 0
      ? row.indexOf('  const costoGs =')
      : row.indexOf('  const { costoGs, enUsd, sinCosto } =')
  const end = row.indexOf(mobile ? '  const acciones =' : '  // #285:', start)
  const helper = funcion(helpers, 'costoVisible')
  return runInNewContext(
    `${helper}
${row.slice(start, end)}
costoTexto`,
    { unit, cotizacion, costoEnGs, sinCostoUnitario, gs, formatUsd },
  )
}

test('Stock display explicit stored zero survives PYG and USD paths', () => {
  for (const unit of [
    { costPyg: 0 },
    { costPyg: '0' },
    { costPyg: null, originalCost: 0, costCurrency: 'PYG' },
    { originalCost: '0', costCurrency: 'PYG' },
    { costPyg: '', originalCost: 0, costCurrency: 'PYG' },
    { costPyg: null, originalCost: 0, costCurrency: 'USD', exchangeRatePyg: 7300 },
  ]) {
    assert.equal(displayedCost(unit, 7300), formatUsd(0), JSON.stringify(unit))
    assert.equal(displayedCost(unit, 7300, true), gs(0), JSON.stringify(unit))
  }
  assert.equal(displayedCost({ originalCost: 0, costCurrency: 'PYG' }, null), gs(0))
  const usd = { originalCost: 0, costCurrency: 'USD' }
  assert.equal(displayedCost(usd, null), formatUsd(0))
  assert.equal(displayedCost(usd, null, true), formatUsd(0))
})

test('Stock display missing null undefined and blank do not become zero', () => {
  for (const unit of [
    {},
    { originalCost: null },
    { originalCost: undefined },
    { originalCost: '' },
    { originalCost: '  ' },
    { costPyg: '', originalCost: null },
  ]) {
    assert.equal(displayedCost(unit, 7300), null)
    assert.equal(displayedCost(unit, 7300, true), 'Sin costo')
  }
  // A stored PYG cost without an original USD amount must not coerce null to USD zero.
  const stored = { costPyg: 7300, originalCost: null, costCurrency: 'USD' }
  assert.equal(displayedCost(stored, null), gs(7300))
})

test('Stock display negatives and invalid values never fabricate amounts', () => {
  for (const field of ['originalCost', 'costPyg']) {
    for (const value of [-1, '-1', 'invalid', Infinity, NaN, false, {}, []]) {
      const unit = { [field]: value, costCurrency: 'PYG' }
      assert.equal(displayedCost(unit, 7300), '—', `${field}: ${String(value)}`)
      assert.equal(displayedCost(unit, 7300, true), '—')
    }
  }
})

test('Stock display retains positive conversion and shared financial zero rejection', () => {
  const unit = { originalCost: 719, costCurrency: 'USD', exchangeRatePyg: 7300 }
  assert.equal(displayedCost(unit, 7300), formatUsd(719))
  assert.equal(displayedCost(unit, 7300, true), gs(5248700))
  assert.equal(displayedCost({ ...unit, costPyg: '' }, 7300), formatUsd(719))
  assert.equal(costoEnGs({ originalCost: 0, costCurrency: 'PYG' }), null)
  assert.equal(sinCostoUnitario({ originalCost: 0 }), false)
})

test('Stock keeps the section tab keys and groups', () => {
  const grupos = between(helpers, 'export const GRUPOS_INVENTARIO', 'export const TAB_LABEL')
  for (const id of ['unidades', 'reservas', 'ubicaciones', 'alertas', 'transito', 'traslados', 'vendidos', 'eliminados', 'taller', 'conteos', 'compartido', 'autorizaciones'])
    assert.ok(grupos.includes(`'${id}'`), id)
  assert.ok(between(helpers, 'export const INVENTARIO_TABS', 'GRUPOS_INVENTARIO').split(',').length >= 12)
})
