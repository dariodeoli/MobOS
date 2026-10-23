import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nombreDesdeRuc, formatoTitulo, tipoDeContribuyente } from './nombreDesdeRuc.js'
import { nombreVisibleDesdeRuc } from './clienteDocumento.js'
import { applyCheckoutIdentity, checkoutBillingPayload } from './checkoutIdentity.js'
import { conNombreDesdeRuc } from '../components/shared/rucLookup.js'

test('persona con coma: «Nombres Apellidos» sin coma, partículas respetadas', () => {
  const r = nombreDesdeRuc({ nameOfficial: 'DE OLIVEIRA ORTIGOZA, DARIO ALFONSO', fullRuc: '5215244-8' })
  assert.deepEqual(r, { tipo: 'persona', nombres: 'Dario Alfonso', apellidos: 'De Oliveira Ortigoza', nombreCompleto: 'Dario Alfonso De Oliveira Ortigoza', razonSocial: 'DE OLIVEIRA ORTIGOZA, DARIO ALFONSO' })
  assert.ok(!r.nombreCompleto.includes(','))
})
test('partículas en minúscula dentro del tramo y tildes/ñ conservadas', () => {
  assert.equal(nombreDesdeRuc({ nameOfficial: 'PEÑA DEL RÍO, MARÍA DE LOS ÁNGELES', ruc: '1234567' }).nombreCompleto, 'María de los Ángeles Peña del Río')
  assert.equal(formatoTitulo('josé  la  cruz'), 'José la Cruz')
  assert.equal(formatoTitulo("o'brien-pérez"), "O'Brien-Pérez")
})
test('persona con givenNames/surnames del proveedor', () => {
  const r = nombreDesdeRuc({ nameOfficial: 'X', givenNames: 'ANA MARIA', surnames: 'GOMEZ', ruc: '90000000' })
  assert.equal(r.tipo, 'persona')
  assert.equal(r.nombreCompleto, 'Ana Maria Gomez')
})
test('persona sin coma: no se inventa el corte', () => {
  assert.equal(nombreDesdeRuc({ nameOfficial: 'JUAN PEREZ', ruc: '1234567' }).nombreCompleto, 'Juan Perez')
})
test('empresa: RUC >= 80.000.000 o tipo societario, razón social tal cual', () => {
  assert.equal(nombreDesdeRuc({ nameOfficial: 'ISTORE PARAGUAY S.A.', fullRuc: '80012345-0' }).nombreCompleto, 'ISTORE PARAGUAY S.A.')
  assert.equal(nombreDesdeRuc({ nameOfficial: 'COMERCIAL, IMPORTADORA S.R.L.' }).tipo, 'empresa')
  assert.equal(nombreDesdeRuc({ nameOfficial: 'NOMBRE RARO, ALGO', ruc: '80000000' }).nombreCompleto, 'NOMBRE RARO, ALGO')
  assert.equal(nombreDesdeRuc({ nameOfficial: 'COMERCIAL QA 1234567 S.A.', ruc: '1234567' }).nombreCompleto, 'COMERCIAL QA 1234567 S.A.')
  assert.equal(tipoDeContribuyente({ ruc: '79999999' }), 'persona')
  assert.equal(tipoDeContribuyente({ ruc: '80000000' }), 'empresa')
})
test('entradas vacías', () => {
  for (const v of [undefined, null, {}, { nameOfficial: '   ' }]) assert.equal(nombreDesdeRuc(v ?? undefined).nombreCompleto, '')
  assert.equal(nombreVisibleDesdeRuc(null), '')
})
test('nombreVisibleDesdeRuc y conNombreDesdeRuc usan la regla única', () => {
  assert.equal(nombreVisibleDesdeRuc('DE OLIVEIRA ORTIGOZA, DARIO ALFONSO'), 'Dario Alfonso De Oliveira Ortigoza')
  assert.equal(conNombreDesdeRuc({ nameOfficial: 'PEREZ, JUAN', fullRuc: '1234567-9' }).nombreCompleto, 'Juan Perez')
})
test('titular de facturación: persona sin coma, empresa exacta', () => {
  const p = applyCheckoutIdentity({}, { nameOfficial: 'DE OLIVEIRA ORTIGOZA, DARIO ALFONSO', fullRuc: '5215244-8' })
  assert.equal(p.name, 'Dario Alfonso De Oliveira Ortigoza')
  assert.deepEqual(checkoutBillingPayload(p), { name: 'Dario Alfonso De Oliveira Ortigoza', document: '5215244-8' })
  const e = applyCheckoutIdentity({}, { nameOfficial: 'ISTORE PARAGUAY S.A.', fullRuc: '80012345-0' })
  assert.deepEqual(checkoutBillingPayload(e), { name: 'ISTORE PARAGUAY S.A.', document: '80012345-0' })
})

// Cada punto de entrada de RUC/CI usa la regla única (no arma nombres por su cuenta).
const FUENTES = {
  'src/components/shared/RucField.jsx': /conNombreDesdeRuc/,
  'src/components/ventas/CheckoutCustomer.jsx': /nombreVisibleDesdeRuc\(datos\)/,
  'src/lib/checkoutIdentity.js': /nombreDesdeRuc/,
  'src/lib/customerIdentity.js': /nombreDesdeRuc/,
  'src/components/customers/CustomerProfile.jsx': /datos\.nombreCompleto/,
  'src/components/control/config/IdentidadCuenta.jsx': /nombreParaNegocio/,
  'src/components/control/PaymentAccounts.jsx': /datos\.nombreCompleto/,
  'src/components/control/DatosPrivados.jsx': /datos\.razonSocial/,
  'src/lib/accountNames.js': /nombreDesdeRuc/,
  'src/components/control/Compras.jsx': /datos\.nombreCompleto/,
  'src/lib/clienteDocumento.js': /nombreDesdeRuc/,
}
test('cada punto de entrada usa la función única', () => {
  for (const [ruta, patron] of Object.entries(FUENTES)) assert.match(readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8'), patron, ruta)
})
test('nadie más aplica el nombre oficial crudo como nombre visible', () => {
  for (const ruta of ['src/components/customers/CustomerProfile.jsx', 'src/components/control/PaymentAccounts.jsx', 'src/components/control/config/IdentidadCuenta.jsx']) {
    assert.doesNotMatch(readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8'), /name: datos\.nameOfficial \?\? datos\.name \?\? /, ruta)
  }
})
