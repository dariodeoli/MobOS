#!/usr/bin/env node
// Racha de CI en main (#245): informa cuántas corridas **completas** verdes
// consecutivas hay en `main`. Las canceladas (un push nuevo las superseded) y
// las pendientes no cuentan: el cierre pide 3 verdes seguidas.
//
// Uso: node scripts/qa-ci-racha.mjs            (cierre con 3)
//      node scripts/qa-ci-racha.mjs --minimo 3
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const indice = args.indexOf('--minimo')
const MINIMO = indice >= 0 ? Math.max(1, Number(args[indice + 1]) || 3) : 3

const crudo = execFileSync('gh', [
  'run', 'list', '--repo', 'dariodeoli/MobOS', '--branch', 'main', '--limit', '12',
  '--json', 'databaseId,status,conclusion,displayTitle,headSha',
], { encoding: 'utf8' })

const corridas = JSON.parse(crudo).filter((fila) => fila.status === 'completed' && fila.conclusion !== 'cancelled')
let racha = 0
for (const corrida of corridas) {
  if (corrida.conclusion !== 'success') break
  racha += 1
}

console.log(`Racha en main: ${racha} corrida(s) completa(s) verde(s) consecutiva(s) (meta ${MINIMO})`)
for (const corrida of corridas.slice(0, racha + 2)) {
  const icono = corrida.conclusion === 'success' ? '✓' : '✘'
  console.log(`  ${icono} ${corrida.databaseId} · ${String(corrida.headSha).slice(0, 7)} · ${corrida.displayTitle.slice(0, 66)}`)
}
if (racha >= MINIMO) {
  console.log(`\nCierre listo: ${racha} >= ${MINIMO}`)
  process.exit(0)
}
console.log(`\nFaltan ${MINIMO - racha} corrida(s) verde(s) para el cierre.`)
process.exit(1)
