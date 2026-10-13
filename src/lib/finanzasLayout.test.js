import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoInfo } from './estados.js'
import { formatGs, partesGs } from '../utils/moneda.js'

// Rediseño de Finanzas (unidad 2B): contratos de código que el navegador no
// ve (la medición real vive en e2e/frontend/finanzas-layout.frontend.spec.js).
const leer = (ruta) => readFileSync(new URL(`../components/${ruta}`, import.meta.url), 'utf8')
const PANTALLAS = ['AuditoriaEfectivo', 'VentasPorCaja', 'PaymentAccounts', 'Conciliacion', 'Reportes', 'Caja', 'Creditos', 'Comisiones']

test('ninguna pantalla de Finanzas usa `min-w-[` (tablas con scroll horizontal bajo md)', () => {
  for (const nombre of PANTALLAS) {
    const codigo = leer(`control/${nombre}.jsx`)
    assert.ok(!/min-w-\[/.test(codigo), `${nombre}.jsx: sin min-w-[ (usar ListaDensa con tarjeta bajo md)`)
    assert.ok(!/overflow-x-auto/.test(codigo), `${nombre}.jsx: sin tablas con overflow-x-auto`)
  }
})

test('los listados de Finanzas salen de ListaDensa y las tarjetas se arman con renderCard', () => {
  for (const nombre of ['AuditoriaEfectivo', 'VentasPorCaja', 'PaymentAccounts', 'Reportes', 'Caja', 'Creditos', 'Comisiones']) {
    const codigo = leer(`control/${nombre}.jsx`)
    assert.match(codigo, /from '@\/components\/shared\/ListaDensa'/, `${nombre}.jsx usa ListaDensa`)
    assert.match(codigo, /renderCard=/, `${nombre}.jsx dibuja la tarjeta bajo md`)
  }
  assert.ok(!/DataTable/.test(leer('control/Reportes.jsx')), 'Reportes no usa el DataTable de la biblioteca (pie de 28px)')
})

test('Auditoría de efectivo: el estado es UN control (chip editable), no badge + select', () => {
  const codigo = leer('control/AuditoriaEfectivo.jsx')
  assert.match(codigo, /<EstadoSelect/)
  assert.ok(!/<Badge\b/.test(codigo), 'sin badge de estado de solo lectura')
  assert.ok(!/<Select aria-label=\{`Estado de/.test(codigo), 'sin select suelto de estado')
  for (const marca of ['VERIFIED', 'PENDING', 'DIFFERENCE']) assert.ok(estadoInfo(marca, 'auditoria').label, marca)
  assert.equal(estadoInfo('DIFFERENCE', 'auditoria').tono, 'bad')
  const selector = readFileSync(new URL('../components/shared/EstadoSelect.jsx', import.meta.url), 'utf8')
  assert.match(selector, /estadoInfo/)
  assert.match(selector, /CLASES_TONO/)
})

test('Bancos y cuentas: el banco se muestra una sola vez (logo + nombre en la primera celda)', () => {
  const codigo = leer('control/PaymentAccounts.jsx')
  const datos = codigo.slice(codigo.indexOf('function datosDe(account)'), codigo.indexOf('// Porcentaje para la tabla'))
  assert.ok(!datos.includes('account.bank'), 'Datos no repite el banco')
  assert.ok(!datos.includes('account.processor'), 'Datos no repite la procesadora')
  assert.match(codigo, /function entidadDe\(account\)/)
  assert.match(codigo, /<BancoLogo banco=\{banco\}/)
})

test('Conciliación: sin copy de depuración y con resumen humano', () => {
  const codigo = leer('control/Conciliacion.jsx')
  assert.ok(!codigo.includes('Lista: {'), 'sin «Lista: N pago(s) · Estado: … · Página: …»')
  assert.ok(!codigo.includes('Selección masiva:'), 'sin «Selección masiva: reemplaza…» a la vista')
  assert.ok(codigo.includes('data-testid="conciliacion-list-scope"'))
  assert.ok(codigo.includes('El estado solo filtra esta lista'))
})

test('Reportes: la barra de controles es una Toolbar con botones del mismo tamaño', () => {
  const codigo = leer('control/Reportes.jsx')
  assert.match(codigo, /<Toolbar/)
  assert.ok(!/text-xs md:h-9 md:min-h-0/.test(codigo), 'Exportar CSV ya no usa su propio tamaño de 12px')
  const botones = codigo.match(/className=\{BOTON_CONTROL\}/g) || []
  assert.ok(botones.length >= 3, 'Actualizar, Imprimir y Exportar comparten BOTON_CONTROL')
})

test('el formateador de guaraníes pone el signo pegado al símbolo', () => {
  assert.equal(formatGs(-50000), '-Gs 50.000')
  assert.deepEqual(partesGs(-50000), { signo: '-', simbolo: 'Gs', digitos: '50.000' })
  assert.deepEqual(partesGs(1200), { signo: '', simbolo: 'Gs', digitos: '1.200' })
  assert.ok(!/Gs\s+-/.test(formatGs(-1)), 'nunca «Gs -»')
})
