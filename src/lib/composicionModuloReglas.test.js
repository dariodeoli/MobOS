import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const leer = ruta => readFileSync(fileURLToPath(new URL(`../${ruta}`, import.meta.url)), 'utf8')

test('ModuleToolbar mantiene contexto, navegacion, controles y acciones en una superficie accesible', () => {
  const codigo = leer('components/shared/ModuleToolbar.jsx')
  assert.match(codigo, /<section[\s\S]*aria-label=\{ariaLabel\}/)
  assert.match(codigo, /<nav aria-label=\{navigationLabel\}/)
  assert.match(codigo, /flex min-w-0 flex-wrap items-center gap-2/)
  for (const slot of ['description', 'navigation', 'controls', 'actions']) {
    assert.match(codigo, new RegExp(`\\b${slot}\\b`), `falta el slot ${slot}`)
  }
})

test('MetricStrip usa una lista descriptiva y exige detalle de alcance en sus consumidores', () => {
  const objeto = leer('components/shared/MetricStrip.jsx')
  assert.match(objeto, /<dl/)
  assert.match(objeto, /<dt/)
  assert.match(objeto, /<dd/)

  const clientes = leer('components/ventas/SellerCustomers.jsx')
  assert.match(clientes, /data-testid="resumen-clientes"/)
  assert.match(clientes, /Clientes de la tienda/)
  assert.match(clientes, /Filas cargadas/)
  assert.match(clientes, /total de la tienda/)
  assert.match(clientes, /entre filas cargadas/)
  assert.doesNotMatch(clientes, /<Badge[^>]*>\{resumenMostrar/)
})

test('Clientes y POS consumen la composicion sin repetir la identidad de pagina', () => {
  const clientes = leer('components/ventas/SellerCustomers.jsx')
  const pos = leer('components/ventas/FormularioVenta.jsx')
  assert.match(clientes, /<ModuleToolbar/)
  assert.match(clientes, /aria-label="Importar y exportar clientes"/)
  assert.match(pos, /<ModuleToolbar/)
  assert.doesNotMatch(pos, /<h2[^>]*>Nueva venta<\/h2>/)
  assert.match(pos, /<Aviso[\s\S]*setAvisoSuspension\(''\)/)
  assert.match(pos, /<Aviso[\s\S]*setAvisoOffline\(''\)/)
})
