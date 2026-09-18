import assert from 'node:assert/strict'
import test from 'node:test'
import { promptLogo } from './logoPrompt.js'

test('el prompt pide las dos versiones con fondo transparente', () => {
  const prompt = promptLogo('MobOS')
  assert.match(prompt, /MobOS/)
  assert.match(prompt, /DOS versiones/)
  assert.match(prompt, /Versión OSCURA/)
  assert.match(prompt, /Versión CLARA/)
  assert.match(prompt, /fondo TRANSPARENTE/i)
})

test('el prompt fija medidas, peso y entrega', () => {
  const prompt = promptLogo()
  assert.match(prompt, /1024×1024/)
  assert.match(prompt, /1600×600/)
  assert.match(prompt, /1 MiB/)
  assert.match(prompt, /logo-oscuro\.png/)
  assert.match(prompt, /logo-claro\.png/)
})
