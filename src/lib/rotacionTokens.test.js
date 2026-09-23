import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { FASES, PASOS } from '../../scripts/rotacion-tokens-pasos.mjs'

// Guarda del checklist ejecutable de rotación (#232): completo, ordenado y sin
// valores de secretos incrustados (solo nombres de variables y placeholders).

test('el checklist de rotación está completo y ordenado por fase', () => {
  const idsFases = FASES.map((fase) => fase.id)
  const ids = PASOS.map((paso) => paso.id)
  assert.equal(new Set(ids).size, ids.length, 'hay ids de paso repetidos')
  for (const paso of PASOS) {
    assert.ok(paso.titulo && paso.accion && paso.verificacion, `paso ${paso.id} incompleto`)
    assert.ok(idsFases.includes(paso.fase), `paso ${paso.id} con fase desconocida`)
    if (paso.comando) {
      assert.ok(paso.comando.bin && paso.comando.args?.length && paso.comando.texto, `comando incompleto en ${paso.id}`)
      assert.notEqual(paso.manual, true, `el paso ${paso.id} no puede ser manual y ejecutable a la vez`)
    }
  }
  for (const fase of FASES) assert.ok(PASOS.some((paso) => paso.fase === fase.id), `fase ${fase.id} sin pasos`)
  const orden = PASOS.map((paso) => idsFases.indexOf(paso.fase))
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'los pasos no siguen el orden de las fases')
})

test('el checklist no incrusta valores de secretos', () => {
  const texto = JSON.stringify({ FASES, PASOS })
  assert.doesNotMatch(texto, /[A-Fa-f0-9]{32,}/, 'hay una cadena larga con pinta de secreto')
  assert.doesNotMatch(texto, /(token|secret|password|clave)"?\s*[:=]\s*"[A-Za-z0-9+/=_-]{16,}"/i, 'hay un valor de secreto incrustado')
  assert.match(texto, /<nuevo>/, 'los comandos con secretos deben usar placeholders (<nuevo>, <viejo>)')
})

test('los comandos npm del checklist pasan los flags con -- (npm se come el resto)', () => {
  // Caso real: `npm run release:prepare --check-deploy-config` NO pasa el flag
  // y el script hace un bump local de versión. El `--` es obligatorio.
  for (const paso of PASOS.filter((item) => item.comando?.bin === 'npm')) {
    const args = paso.comando.args
    const flags = args.filter((arg) => arg.startsWith('-') && arg !== '--')
    if (!flags.length) continue
    const separador = args.indexOf('--')
    assert.ok(separador !== -1 && separador < args.indexOf(flags[0]), `el comando de ${paso.id} necesita -- antes de los flags`)
    assert.match(paso.comando.texto, / -- /, `el texto de ${paso.id} debe mostrar el --`)
  }
  const doc = readFileSync(new URL('../../docs/ROTACION-TOKENS.md', import.meta.url), 'utf8')
  assert.doesNotMatch(doc, /npm run release:prepare --check-deploy-config/, 'la doc no puede recomendar el npm run sin --')
})
