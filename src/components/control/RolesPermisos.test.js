// Contrato del interruptor "Vendedores y caja pueden ver costos y proveedor":
// solo el dueño lo ve y lo guarda por el endpoint auditado del backend.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('./RolesPermisos.jsx', import.meta.url), 'utf8')
const bloque = fuente.slice(fuente.indexOf('export function PermisoCostos'), fuente.indexOf('export default function RolesPermisos'))

test('el interruptor de costos solo se renderiza para el dueño', () => {
  assert.match(bloque, /esDueno = Boolean\(sesion\?\.esPropietario\)/)
  assert.match(bloque, /if \(!esDueno\) return null/)
  assert.ok(bloque.indexOf('if (!esDueno) return null') < bloque.indexOf('<Switch'), 'el return null precede al Switch')
})

test('el interruptor lee y guarda en /api/tenant/cost-visibility con etiqueta accesible', () => {
  assert.match(bloque, /api\.get\('\/api\/tenant\/cost-visibility'\)/)
  assert.match(bloque, /api\.put\('\/api\/tenant\/cost-visibility', \{ sellerSeesCosts: valor \}\)/)
  assert.match(bloque, /Vendedores y caja pueden ver costos y proveedor/)
  assert.match(bloque, /useState\(true\)/, 'por defecto encendido')
})

test('la pestaña de permisos monta el interruptor', () => {
  assert.match(fuente, /<PermisoCostos \/>/)
})
