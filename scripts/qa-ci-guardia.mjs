#!/usr/bin/env node
// Guardia de CI (#245): cuenta la racha de corridas **completas** verdes en
// `main`, reporta la última roja con sus jobs y tests fallidos (sin rojos
// silenciosos) y, con `--esperar`, aguanta a que termine la corrida en curso
// antes de decidir. Pensada para el vigía y para el hito del release.
//
//   node scripts/qa-ci-guardia.mjs                       # estado + racha
//   node scripts/qa-ci-guardia.mjs --minimo 3            # exit 0 solo con 3 verdes
//   node scripts/qa-ci-guardia.mjs --esperar 900         # espera la corrida en curso (s)
//   node scripts/qa-ci-guardia.mjs --reporte docs/qa/245-ci/guardia.md
//
// Salidas: 0 = racha ≥ mínimo · 1 = racha corta (roja o pendiente) · 2 = se
// agotó la espera con la corrida aún en curso.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const valor = (bandera, porDefecto) => { const i = args.indexOf(bandera); return i >= 0 ? args[i + 1] : porDefecto }
const MINIMO = Math.max(1, Number(valor('--minimo', 3)) || 3)
const ESPERA = Math.max(0, Number(valor('--esperar', 0)) || 0)
const REPORTE = valor('--reporte', '')

const gh = (argumentos) => JSON.parse(execFileSync('gh', argumentos, { encoding: 'utf8' }))
const corridasDe = () => gh(['run', 'list', '--repo', 'dariodeoli/MobOS', '--branch', 'main', '--limit', '15', '--json', 'databaseId,status,conclusion,displayTitle,headSha,createdAt'])

/** Racha de completas verdes consecutivas (las canceladas no cuentan). */
export function calcularRacha(corridas = []) {
  const completas = corridas.filter((corrida) => corrida.status === 'completed' && corrida.conclusion !== 'cancelled')
  let racha = 0
  for (const corrida of completas) {
    if (corrida.conclusion !== 'success') break
    racha += 1
  }
  return { racha, completas }
}

const icono = (corrida) => (corrida.conclusion === 'success' ? '✓' : corrida.status !== 'completed' ? '…' : corrida.conclusion === 'cancelled' ? '⊘' : '✘')

async function esperarCorrida(corridas, segundos) {
  const enCurso = corridas.find((corrida) => corrida.status !== 'completed')
  if (!enCurso || segundos <= 0) return { enCurso, estado: enCurso ? 'pendiente' : 'sin-corrida' }
  const fin = Date.now() + segundos * 1000
  while (Date.now() < fin) {
    await new Promise((resolver) => setTimeout(resolver, 15_000))
    const actual = corridasDe().find((corrida) => corrida.databaseId === enCurso.databaseId)
    if (!actual || actual.status === 'completed') return { corrida: actual || null, estado: 'terminada' }
  }
  return { enCurso, estado: 'timeout' }
}

/** Tests fallidos de una corrida: por job con fallos, hasta 6 nombres. */
export function fallosDe(corridaId) {
  const jobs = gh(['run', 'view', String(corridaId), '--json', 'jobs']).jobs.filter((job) => job.conclusion === 'failure')
  const salida = []
  for (const job of jobs) {
    let log = ''
    try { log = execFileSync('gh', ['run', 'view', '--job', String(job.databaseId), '--log-failed'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) } catch { /* sin log disponible */ }
    const tests = [...log.matchAll(/✘\s+\d+\s+\[[^\]]+\]\s+›\s+([^\n\r]+)/g)].map((coincidencia) => coincidencia[1].trim()).slice(0, 6)
    salida.push({ job: job.name, tests })
  }
  return salida
}

const corridas = corridasDe()
const { racha, completas } = calcularRacha(corridas)
const espera = await esperarCorrida(corridas, ESPERA)
const recientes = corridasDe()
const rachaFinal = calcularRacha(recientes).racha
const ultimaRoja = completas.find((corrida) => corrida.conclusion !== 'success') || null
const fallos = ultimaRoja ? fallosDe(ultimaRoja.databaseId) : []

const lineas = []
lineas.push(`Racha en main: ${rachaFinal}/${MINIMO} corridas completas verdes consecutivas`)
for (const corrida of recientes.slice(0, rachaFinal + 4)) {
  lineas.push(`  ${icono(corrida)} ${corrida.databaseId} · ${String(corrida.headSha).slice(0, 7)} · ${corrida.createdAt} · ${corrida.displayTitle.slice(0, 60)}`)
}
if (espera.estado === 'terminada') lineas.push(`Corrida en curso: terminó (${espera.corrida?.conclusion || 'desconocido'})`)
if (espera.estado === 'timeout') lineas.push(`Corrida en curso: sigue corriendo tras ${ESPERA}s`)
if (espera.estado === 'pendiente') lineas.push(`Corrida en curso: ${espera.enCurso.databaseId} (usá --esperar para aguardarla)`)
if (ultimaRoja) {
  lineas.push(`Última roja: ${ultimaRoja.databaseId} · ${String(ultimaRoja.headSha).slice(0, 7)} · ${ultimaRoja.displayTitle.slice(0, 60)}`)
  for (const job of fallos) {
    lineas.push(`  ${job.job}${job.tests.length ? `: ${job.tests.join(' | ')}` : ''}`)
  }
}
const texto = lineas.join('\n')
console.log(texto)
if (REPORTE) {
  mkdirSync(dirname(REPORTE), { recursive: true })
  writeFileSync(REPORTE, `# Guardia de CI (#245) · ${new Date().toISOString()}\n\n\`\`\`\n${texto}\n\`\`\`\n`)
  console.log(`\nReporte escrito en ${REPORTE}`)
}
if (rachaFinal >= MINIMO) process.exit(0)
process.exit(espera.estado === 'timeout' ? 2 : 1)
