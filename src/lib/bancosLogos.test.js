import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { BANCOS_PARAGUAY } from './bancos-paraguay.js'
import {
  LOGOS_BANCOS,
  MARCAS_MEDIO_PAGO_DISPONIBLES,
  coberturaBancos,
  inicialesDeBanco,
  logoDeBanco,
} from './bancosLogos.js'

// Aserción de fuente de #119: el registro de logos cubre TODO el catálogo de
// bancos, los archivos existen en el repo (sin hotlinks) y los que no tienen
// logo confiable caen a monograma con iniciales y color de marca.

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const leer = (ruta) => readFileSync(`${RAIZ}/${ruta}`, 'utf8')

test('el registro cubre las 28 entradas del catálogo, sin sobras', () => {
  assert.deepEqual(Object.keys(LOGOS_BANCOS).sort(), [...BANCOS_PARAGUAY].sort())
  assert.equal(coberturaBancos().length, 28)
})

test('cada banco resuelve a archivo, marca o monograma', () => {
  for (const { nombre, tipo, archivo, marca } of coberturaBancos()) {
    assert.ok(['archivo', 'marca', 'monograma'].includes(tipo), `${nombre}: tipo ${tipo}`)
    if (tipo === 'archivo') {
      assert.match(archivo, /\.(svg|png)$/, `${nombre}: formato`)
      assert.ok(existsSync(`${RAIZ}/public/bancos/${archivo}`), `falta public/bancos/${archivo}`)
    }
    if (tipo === 'marca') {
      assert.ok(MARCAS_MEDIO_PAGO_DISPONIBLES.includes(marca), `${nombre}: marca ${marca}`)
    }
  }
})

test('los monogramas traen iniciales y color de marca', () => {
  for (const [nombre, entrada] of Object.entries(LOGOS_BANCOS)) {
    if (entrada.archivo || entrada.marca) continue
    assert.match(entrada.monograma, /^[A-ZÑÍÓ]{2,3}$/, `${nombre}: monograma`)
    assert.match(entrada.color, /^#[0-9A-F]{6}$/i, `${nombre}: color`)
  }
})

test('los logos viven en el repo: sin hotlinks', () => {
  for (const ruta of ['src/lib/bancosLogos.js', 'src/components/shared/BancoLogo.jsx', 'src/components/shared/BancoCombobox.jsx']) {
    assert.ok(!/https?:\/\//.test(leer(ruta)), `${ruta} no puede apuntar a URLs externas`)
  }
})

test('un nombre fuera del catálogo cae a monograma y no rompe', () => {
  assert.equal(logoDeBanco(''), null)
  const inventado = logoDeBanco('Banco Inventado del Chaco')
  assert.equal(inventado.tipo, 'monograma')
  assert.equal(inventado.iniciales, 'IC')
  assert.equal(inventado.generico, true)
  assert.match(inventado.color, /^#[0-9A-F]{6}$/i)
  // Los monogramas del catálogo no son genéricos: se muestran también en listados.
  assert.equal(logoDeBanco('Banco Regional').generico, undefined)
  // Alias frecuentes del catálogo.
  assert.equal(logoDeBanco('Banco Itau').tipo, 'archivo')
  assert.equal(logoDeBanco('bbva').archivo, 'bbva.svg')
  assert.equal(inicialesDeBanco('Cooperativa Medalla Milagrosa'), 'MM')
})

test('MedioPago expone las marcas que el registro reutiliza', () => {
  const codigo = leer('src/components/shared/MedioPago.jsx')
  assert.match(codigo, /export const MARCAS_MEDIO_PAGO = \{/)
  assert.match(codigo, /export function marcaDeMedio\(/)
  for (const clave of MARCAS_MEDIO_PAGO_DISPONIBLES) {
    assert.match(codigo, new RegExp(`\\b${clave}: `), `falta la marca ${clave}`)
  }
})
