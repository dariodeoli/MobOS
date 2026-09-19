// Phase 1 QA global teardown: stop the dedicated Postgres cluster and any
// harness server that survived the run (next dev / vite). Ignore failures when
// the cluster is not running (e.g. a crashed run).

import { execFileSync } from 'node:child_process'

// Mata solo los servidores que pertenecen a ESTE repo en los puertos del
// harness: otro agente con su propio puerto/base no se toca.
function limpiarServidores() {
  const raiz = process.cwd()
  const puertos = [process.env.MOBOS_E2E_API_PORT || '3001', process.env.MOBOS_E2E_WEB_PORT || '5175']
  for (const puerto of puertos) {
    let pids = []
    try {
      pids = execFileSync('lsof', ['-ti', `tcp:${puerto}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    } catch { continue }
    for (const pid of pids) {
      try {
        const linea = execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' })
        if (!linea.includes(raiz)) continue
        process.kill(Number(pid), 'SIGKILL')
        console.log(`[e2e] Servidor del harness en :${puerto} detenido (pid ${pid}).`)
      } catch { /* proceso ya muerto */ }
    }
  }
}

export default async function globalTeardown() {
  try {
    execFileSync('/opt/homebrew/bin/pg_ctl', ['-D', process.env.MOBOS_E2E_PGDATA || '/tmp/mobos-e2e-pg', '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    console.log('[e2e] PostgreSQL cluster stopped.')
  } catch {
    console.log('[e2e] PostgreSQL cluster was not running; nothing to stop.')
  }
  limpiarServidores()
}
