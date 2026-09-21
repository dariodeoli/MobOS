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

// Aserción de fuente de #119/#139: el registro de logos cubre TODO el catálogo
// vigente de bancos, los archivos existen en el repo (sin hotlinks), los que no
// tienen logo confiable caen a monograma con iniciales y color, y las entidades
// absorbidas quedaron fuera del catálogo.

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const leer = (ruta) => readFileSync(`${RAIZ}/${ruta}`, 'utf8')

test('el registro cubre el catálogo completo, sin sobras', () => {
  assert.deepEqual(Object.keys(LOGOS_BANCOS).sort(), [...BANCOS_PARAGUAY].sort())
  assert.equal(coberturaBancos().length, BANCOS_PARAGUAY.length)
})

test('el catálogo está en orden alfabético y sin repetidos', () => {
  assert.deepEqual([...BANCOS_PARAGUAY].sort((a, b) => a.localeCompare(b, 'es')), [...BANCOS_PARAGUAY])
  assert.equal(new Set(BANCOS_PARAGUAY).size, BANCOS_PARAGUAY.length)
})

test('las entidades absorbidas quedan fuera y sus sucesoras adentro', () => {
  const fuera = ['Banco Regional', 'Visión Banco', 'Banco Bilbao Vizcaya Argentaria Paraguay', 'Banco Itaú', 'Banco Amambay', 'Banco Río', 'Bancoex', 'Banca Privada de Inversión', 'Solar Ahorro y Finanzas']
  for (const nombre of fuera) {
    assert.ok(!BANCOS_PARAGUAY.includes(nombre), `${nombre} ya no opera y no debe estar en el catálogo`)
  }
  for (const nombre of ['Banco Continental', 'Banco GNB Paraguay', 'Banco Sudameris', 'Banco Basa', 'Solar Banco', 'ueno bank']) {
    assert.ok(BANCOS_PARAGUAY.includes(nombre), `falta ${nombre}`)
  }
  assert.ok(!existsSync(`${RAIZ}/public/bancos/bbva.svg`), 'el asset de BBVA se retiró')
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
  // Una entidad que ya no está en el catálogo cae al monograma genérico.
  assert.equal(logoDeBanco('Banco Regional').generico, true)
  // Alias frecuentes del catálogo.
  assert.equal(logoDeBanco('Banco Itau').tipo, 'archivo')
  assert.equal(logoDeBanco('citi').archivo, 'citibank.svg')
  assert.equal(logoDeBanco('solar ahorro y finanzas').archivo, 'solar.svg')
  assert.equal(inicialesDeBanco('Cooperativa Medalla Milagrosa'), 'MM')
})

test('el selector muestra el catálogo completo al abrir', () => {
  const codigo = leer('src/components/shared/BancoCombobox.jsx')
  assert.match(codigo, /if \(!termino\) return BANCOS_PARAGUAY/, 'sin texto debe listar todo el catálogo')
  assert.ok(!/slice\(0, MAX_SUGERENCIAS\)/.test(codigo), 'no puede recortar la lista')
  assert.match(codigo, /scrollIntoView/, 'la opción resaltada debe quedar a la vista')
})

test('MedioPago expone las marcas que el registro reutiliza', () => {
  const codigo = leer('src/components/shared/MedioPago.jsx')
  assert.match(codigo, /export const MARCAS_MEDIO_PAGO = \{/)
  assert.match(codigo, /export function marcaDeMedio\(/)
  for (const clave of MARCAS_MEDIO_PAGO_DISPONIBLES) {
    assert.match(codigo, new RegExp(`\\b${clave}: `), `falta la marca ${clave}`)
  }
})
