import assert from 'node:assert/strict'
import test from 'node:test'
import { detectarDelimitador, filasConEncabezado, parseDelimited } from './csv.js'

test('detecta tab como delimitador en exports de Shopify', () => {
  assert.equal(detectarDelimitador('Customer ID\tFirst Name\tEmail\n1\tAna\tana@x.com'), '\t')
  assert.equal(detectarDelimitador('a,b,c\n1,2,3'), ',')
  assert.equal(detectarDelimitador('a;b;c\n1;2;3'), ';')
})

test('parsea campos entre comillas con delimitadores y comillas escapadas', () => {
  const filas = parseDelimited('name\tdesc\n"MERZIN S.A\tRUC 8001"\t"dijo ""hola"""\n')
  assert.deepEqual(filas, [['name', 'desc'], ['MERZIN S.A\tRUC 8001', 'dijo "hola"']])
})

test('ignora filas vacías y tolera fin sin salto de línea', () => {
  assert.deepEqual(parseDelimited('a\tb\n\n1\t2'), [['a', 'b'], ['1', '2']])
})

test('mapea filas por encabezado', () => {
  const filas = filasConEncabezado([['ID', 'Nombre'], ['1', 'Ana']])
  assert.deepEqual(filas, [{ ID: '1', Nombre: 'Ana' }])
})
