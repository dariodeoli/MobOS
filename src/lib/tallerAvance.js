import { SIGUIENTE_SERVICIO } from './estadosServicio.js'

// Mutation confirmation and presentation refresh are separate boundaries.
export async function advanceService(row, { mutate, refresh }) {
  const status = SIGUIENTE_SERVICIO[row.status]
  if (!status) return { id: row.id, outcome: 'skipped' }
  try {
    await mutate({ id: row.id, status })
  } catch (error) {
    return { id: row.id, outcome: 'failed', error }
  }
  try {
    const refreshed = await refresh()
    return { id: row.id, status, outcome: 'advanced', refreshFailed: refreshed === false }
  } catch (error) {
    return { id: row.id, status, outcome: 'advanced', refreshFailed: true, error }
  }
}

export async function advanceSelectedServices(selected, visible, advance) {
  const results = []
  for (const id of selected) {
    const row = visible.find(item => item.id === id)
    results.push(
      row && SIGUIENTE_SERVICIO[row.status] ? await advance(row) : { id, outcome: 'skipped' },
    )
  }
  const advanced = results.filter(result => result.outcome === 'advanced')
  return {
    advanced: advanced.length,
    failed: results.filter(result => result.outcome === 'failed').length,
    skipped: results.filter(result => result.outcome === 'skipped').length,
    refreshFailed: advanced.some(result => result.refreshFailed),
    confirmedIds: advanced.map(result => result.id),
  }
}

export function serviceAdvanceFeedback(result) {
  const parts = [
    `${result.advanced} ${result.advanced === 1 ? 'orden avanzada' : 'órdenes avanzadas'}.`,
  ]
  if (result.failed)
    parts.push(
      `${result.failed} ${result.failed === 1 ? 'falló' : 'fallaron'}; conserva la selección para reintentar.`,
    )
  if (result.skipped)
    parts.push(`${result.skipped} sin avanzar (fuera de la vista o sin estado siguiente).`)
  if (result.refreshFailed)
    parts.push(
      'El cambio se guardó, pero no se pudo actualizar la lista. Actualiza antes de continuar.',
    )
  return parts.join(' ')
}
