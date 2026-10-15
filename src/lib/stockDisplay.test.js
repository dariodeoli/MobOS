import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLORES_BASE, TEXTO_CLARO, TEXTO_OSCURO, colorConfigurado, contraste, estiloCondicion, hexARgb, normalizarConfig,
  ordenarPorPreferencia, paletaFila, preferenciaEfectiva, textoSobre,
} from './stockDisplay.js'

test('los fondos de fábrica (claro y oscuro) dan texto ≥ 4.5:1', () => {
  for (const tema of ['claro', 'oscuro']) {
    for (const condicion of ['nuevo', 'semi']) {
      const fondo = COLORES_BASE[tema][condicion]
      const { fg, fg2 } = paletaFila(fondo)
      assert.ok(contraste(fg, fondo) >= 4.5, `${tema}/${condicion} principal`)
      assert.ok(contraste(fg2, fondo) >= 4.5, `${tema}/${condicion} secundario`)
    }
  }
})

test('cualquier color elegido da texto legible (≥ 4.5:1), incluso los medios', () => {
  const muestra = ['#808080', '#777777', '#7f7fff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#123456', '#ffffff', '#000000', '#6b7280', '#a3a3a3', '#8a8a8a']
  for (const fondo of muestra) {
    const { fg, fg2 } = paletaFila(fondo)
    assert.ok(contraste(fg, fondo) >= 4.5, `${fondo} principal ${contraste(fg, fondo).toFixed(2)}`)
    assert.ok(contraste(fg2, fondo) >= 4.5, `${fondo} secundario ${contraste(fg2, fondo).toFixed(2)}`)
  }
  assert.equal(textoSobre('#000000'), TEXTO_OSCURO)
  assert.equal(textoSobre('#ffffff'), TEXTO_CLARO)
})

test('normalizarConfig descarta lo inválido', () => {
  assert.deepEqual(normalizarConfig(null), { tipoPrimero: '', condicionPrimero: '', colores: {} })
  const c = normalizarConfig({ tipoPrimero: 'EQUIPO', condicionPrimero: 'usado', colores: { '*': { nuevo: '#ABCDEF', semi: 'rojo' }, x: {} } })
  assert.equal(c.tipoPrimero, 'EQUIPO')
  assert.equal(c.condicionPrimero, '')
  assert.deepEqual(c.colores, { '*': { nuevo: '#abcdef' } })
})

test('color configurado: el del depósito pisa el general; sin config usa los tokens', () => {
  const config = { colores: { '*': { nuevo: '#dcf3e5' }, d1: { nuevo: '#bbf7d0', semi: '#fde68a' } } }
  assert.equal(colorConfigurado({ condition: 'NEW', locationId: 'd1' }, config), '#bbf7d0')
  assert.equal(colorConfigurado({ condition: 'NEW', locationId: 'd2' }, config), '#dcf3e5')
  assert.equal(colorConfigurado({ condition: 'USED', locationId: 'd1' }, config), '#fde68a')
  assert.equal(colorConfigurado({ condition: 'USED', locationId: 'd2' }, config), '')
  assert.equal(estiloCondicion({ condition: 'USED', locationId: 'd2' }, config), undefined)
  const estilo = estiloCondicion({ condition: 'NEW', locationId: 'd1' }, config)
  assert.equal(estilo['--pl-bg'], hexARgb('#bbf7d0').join(' '))
  assert.ok(estilo['--pl-fg'] && estilo['--pl-fg2'] && estilo['--pl-bd'])
})

test('la preferencia del usuario pisa campo a campo la de la empresa', () => {
  const empresa = { tipoPrimero: 'EQUIPO', condicionPrimero: 'nuevo' }
  assert.deepEqual(preferenciaEfectiva(empresa, null), { tipoPrimero: 'EQUIPO', condicionPrimero: 'nuevo' })
  assert.deepEqual(preferenciaEfectiva(empresa, { condicionPrimero: 'semi' }), { tipoPrimero: 'EQUIPO', condicionPrimero: 'semi' })
})

test('el orden por preferencia agrupa tipo y condición y conserva el orden dentro de cada grupo', () => {
  const items = [
    { id: 'a1', stockKind: 'ACCESORIO', condition: 'NEW' },
    { id: 'e1', stockKind: 'EQUIPO', condition: 'USED' },
    { id: 'e2', stockKind: 'EQUIPO', condition: 'NEW' },
    { id: 'a2', stockKind: 'ACCESORIO', condition: 'USED' },
    { id: 'e3', stockKind: 'EQUIPO', condition: 'NEW' },
  ]
  const ids = (lista) => lista.map((i) => i.id)
  assert.deepEqual(ids(ordenarPorPreferencia(items, { tipoPrimero: '', condicionPrimero: '' })), ['a1', 'e1', 'e2', 'a2', 'e3'])
  assert.deepEqual(ids(ordenarPorPreferencia(items, { tipoPrimero: 'EQUIPO', condicionPrimero: 'nuevo' })), ['e2', 'e3', 'e1', 'a1', 'a2'])
  assert.deepEqual(ids(ordenarPorPreferencia(items, { tipoPrimero: 'EQUIPO', condicionPrimero: 'semi' })), ['e1', 'e2', 'e3', 'a2', 'a1'])
  assert.deepEqual(ids(ordenarPorPreferencia(items, { tipoPrimero: 'ACCESORIO', condicionPrimero: '' })), ['a1', 'a2', 'e1', 'e2', 'e3'])
  assert.deepEqual(ids(items), ['a1', 'e1', 'e2', 'a2', 'e3'], 'no muta el original')
})
