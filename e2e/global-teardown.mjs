// Phase 1 QA global teardown: stop the dedicated Postgres cluster.
// Ignore failure when the cluster is not running (e.g. a crashed run).

import { execFileSync } from 'node:child_process'

export default async function globalTeardown() {
  try {
    execFileSync('/opt/homebrew/bin/pg_ctl', ['-D', '/tmp/mobos-e2e-pg', '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    console.log('[e2e] PostgreSQL cluster stopped.')
  } catch {
    console.log('[e2e] PostgreSQL cluster was not running; nothing to stop.')
  }
}
