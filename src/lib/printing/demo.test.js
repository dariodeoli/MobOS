// Guarda de la demo de impresión (#319/#336): la versión del agente que se ve
// en la tarjeta de Puentes tiene que ser la publicada. Si el print-agent sube
// de versión, este test lo obliga a actualizar la demo (y el e2e de #319 usa
// la misma constante, así que la spec no vuelve a desalinearse sola).
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION_AGENTE_DEMO, storeDemo } from './demo.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

test('la demo de Puentes muestra la versión publicada del print-agent', () => {
  const puente = storeDemo().bridges[0]
  assert.equal(puente.version, VERSION_AGENTE_DEMO, 'la tarjeta de la demo sale de la constante')

  const paquete = JSON.parse(readFileSync(join(RAIZ, 'print-agent', 'package.json'), 'utf8'))
  assert.equal(VERSION_AGENTE_DEMO, paquete.version, 'el bump del agente tiene que actualizar VERSION_AGENTE_DEMO')

  const server = readFileSync(join(RAIZ, 'print-agent', 'server.mjs'), 'utf8')
  assert.match(server, new RegExp(`const VERSION = '${VERSION_AGENTE_DEMO.replace(/\./g, '\\.')}'`), 'server.mjs y package.json tienen que estar alineados')
})
