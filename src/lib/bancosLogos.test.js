import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveInstitution, sugerenciasDeBanco } from 'owncoding-ui/utils'
import { logoDeBanco as logoConAssets } from 'owncoding-ui/financial'
import { BANCOS_PARAGUAY } from './bancos-paraguay.js'
import { coberturaBancos, inicialesDeBanco, logoDeBanco } from './bancosLogos.js'

const migration = readFileSync(new URL('../../backend/prisma/migrations/20270202100000_bank_catalog_labels/migration.sql', import.meta.url), 'utf8')
const aliases = [...migration.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(([, before, after]) => [before, after])

test('el selector usa las 32 instituciones compartidas, sin repetidos ni truncar sugerencias', () => {
  assert.equal(BANCOS_PARAGUAY.length, 32)
  assert.equal(new Set(BANCOS_PARAGUAY).size, 32)
  assert.deepEqual(sugerenciasDeBanco(''), BANCOS_PARAGUAY)
  assert.equal(coberturaBancos().length, 32)
  for (const name of BANCOS_PARAGUAY) assert.equal(resolveInstitution(name).record.name, name)
})

test('logos compartidos distinguen Ueno, Zeta y nombres históricos sin inferir persistencia', () => {
  assert.equal(logoDeBanco('ueno').banco, 'ueno bank')
  assert.equal(logoDeBanco('Zeta Banco').banco, 'Zeta Banco')
  assert.equal(resolveInstitution('Financiera El Comercio').matchedBy, 'historical')
  assert.equal(resolveInstitution('Financiera Finexpar').record.name, 'Zeta Banco')
  assert.ok(!aliases.some(([before]) => before === 'Financiera Finexpar'), 'resolver un logo no autoriza una migración de identidad')
  for (const name of BANCOS_PARAGUAY) {
    const logo = logoConAssets(name, 'compacto')
    assert.ok(logo && logo.visual, name)
    assert.ok(['archivo', 'monograma', 'texto', 'horizontal-contained', 'marca-contained'].includes(logo.visual.tipo), name)
  }
})

test('desconocidos siguen como texto/monograma con identidad original', () => {
  assert.equal(logoDeBanco(''), null)
  const name = 'Banco Inventado del Chaco'
  assert.equal(resolveInstitution(name).status, 'unknown')
  assert.equal(logoDeBanco(name).banco, name)
  assert.equal(logoDeBanco(name).generico, true)
  assert.equal(inicialesDeBanco(name), 'IC')
})

test('migración: siete alias exactos de la misma institución, idempotentes y respaldados por tenant', () => {
  assert.equal(aliases.length, 7)
  for (const [before, after] of aliases) {
    const resolved = resolveInstitution(before)
    assert.equal(resolved.status, 'resolved', before)
    assert.equal(resolved.matchedBy, 'alias', before)
    assert.equal(resolved.record.name, after, before)
  }
  const normalize = value => new Map(aliases).get(value) || value
  for (const name of [...aliases.flat(), 'Financiera El Comercio', 'Financiera Finexpar', 'Banco Regional', 'Otro banco']) {
    assert.equal(normalize(normalize(name)), normalize(name))
    if (!aliases.some(([before]) => before === name)) assert.equal(normalize(name), name)
  }
  assert.match(migration, /INSERT INTO "AuditLog"/)
  assert.match(migration, /jsonb_build_object\('before', previous, 'after', canonical/)
  assert.match(migration, /account\."tenantId" = candidates\."tenantId"/)
  assert.doesNotMatch(migration, /UPDATE "Payment"|accountNumber|holder/)
})
