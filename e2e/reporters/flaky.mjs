// Reporte de flakiness del arnés e2e (#245).
//
// Deja `test-results/reporte-flaky.md|json` con los tests que fallaron o que
// necesitaron más de un intento, para aislar el flake y corregir la raíz (no
// hay reintentos: `retries: 0`). No cambia el resultado de la corrida.
import { mkdirSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

const SALIDA = process.env.MOBOS_E2E_REPORTE_DIR || 'test-results'
const enGitHub = process.env.GITHUB_ACTIONS === 'true'

export default class ReporteFlaky {
  constructor() {
    this.tests = new Map()
  }

  onTestEnd(test, result) {
    let proyecto = ''
    try { proyecto = test.parent?.project?.()?.name || '' } catch { /* sin proyecto */ }
    const partes = test.titlePath().filter((parte) => parte && parte !== proyecto && !parte.endsWith('.spec.js'))
    this.tests.set(test.id, {
      titulo: `${relative(process.cwd(), test.location.file)}:${test.location.line} › ${partes.join(' › ')}`,
      proyecto,
      intentos: test.results.length,
      estado: result.status,
      esperado: test.expectedStatus,
    })
  }

  onEnd(result) {
    const filas = [...this.tests.values()]
    if (!filas.length) return
    const pasados = filas.filter((t) => t.estado === 'passed' && t.intentos === 1)
    const flaky = filas.filter((t) => t.estado === 'passed' && t.intentos > 1)
    const esperados = filas.filter((t) => t.esperado === 'failed' && (t.estado === 'failed' || t.estado === 'passed'))
    const fallos = filas.filter((t) => t.estado !== 'passed' && t.estado !== 'skipped' && t.esperado !== 'failed')
    const salteados = filas.filter((t) => t.estado === 'skipped')

    const lineas = [
      `# Reporte de flakiness — ${new Date().toISOString()}`,
      '',
      `Resultado de la corrida: **${result.status}** · ${Math.round((result.duration ?? 0) / 1000)} s`,
      '',
      '| Estado | Cantidad |',
      '| --- | --- |',
      `| Pasados al primer intento | ${pasados.length} |`,
      `| Flaky (pasaron con retry) | ${flaky.length} |`,
      `| Fallos inesperados | ${fallos.length} |`,
      `| Fallos esperados (test.fail) | ${esperados.length} |`,
      `| Salteados | ${salteados.length} |`,
      '',
    ]
    if (flaky.length) {
      lineas.push('## Pasaron con más de un intento (aislar el flake)', ...flaky.map((t) => `- ${t.titulo} (${t.intentos} intentos)`), '')
    }
    if (fallos.length) lineas.push('## Fallos inesperados', ...fallos.map((t) => `- ${t.titulo}`), '')
    if (esperados.length) lineas.push('## Fallos esperados (test.fail)', ...esperados.map((t) => `- ${t.titulo}`), '')

    try {
      mkdirSync(SALIDA, { recursive: true })
      writeFileSync(`${SALIDA}/reporte-flaky.md`, `${lineas.join('\n')}\n`)
      writeFileSync(`${SALIDA}/reporte-flaky.json`, `${JSON.stringify({
        fecha: new Date().toISOString(),
        estado: result.status,
        pasados: pasados.length,
        flaky: flaky.map((t) => t.titulo),
        fallos: fallos.map((t) => t.titulo),
        esperados: esperados.map((t) => t.titulo),
        salteados: salteados.length,
      }, null, 2)}\n`)
    } catch { /* el reporte no puede hacer fallar la corrida */ }

    console.log(`\n[flaky] ${pasados.length} al primer intento · ${flaky.length} flaky · ${fallos.length} fallos inesperados · ${esperados.length} esperados · ${salteados.length} salteados`)
    for (const t of flaky) console.log(`[flaky] retry: ${t.titulo}`)
    if (enGitHub) {
      for (const t of flaky) console.log(`::warning title=Test flaky::${t.titulo} (pasó en el intento ${t.intentos})`)
      for (const t of fallos) console.log(`::error title=Test fallido::${t.titulo}`)
    }
  }
}
