// Métricas de impresión (issue de telemetría): funciones puras que resumen los
// trabajos de un rango en totales, latencias por impresora, serie por hora y
// últimos trabajos. El endpoint solo consulta y recorta; la aritmética vive acá
// para poder probarla sin base.

export type TrabajoMetrica = {
  id: string
  state: string
  printerId: string | null
  printerName: string | null
  destination: string
  transport: string | null
  queueMs: number | null
  durationMs: number | null
  enqueuedAt: Date
  claimedAt: Date | null
  confirmedAt: Date | null
  reference: string
}

export const ESTADOS_EXITOSOS = ['ACEPTADO', 'CONFIRMADO'] as const
export const ESTADOS_ABIERTOS = ['PENDIENTE', 'RECLAMADO'] as const
// Tope de buckets horarios: 90 días. Más rango no aporta a los gráficos y
// haría crecer la respuesta sin control.
export const MAX_HORAS_SERIE = 24 * 90

const HORA_MS = 60 * 60 * 1000

const numero = (valor: number | null | undefined): valor is number => typeof valor === 'number' && Number.isFinite(valor)

/** Promedio entero (ms) o null sin muestras. */
export function promedio(valores: number[]): number | null {
  if (!valores.length) return null
  return Math.round(valores.reduce((suma, valor) => suma + valor, 0) / valores.length)
}

/** Percentil por rango más cercano, con el mínimo de muestras posible. */
export function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null
  const ordenados = [...valores].sort((izquierda, derecha) => izquierda - derecha)
  const indice = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1))
  return ordenados[indice]
}

/** Tasa de éxito 0–100 (un decimal) sobre los trabajos con desenlace. */
export function tasaExito(jobs: TrabajoMetrica[]): number | null {
  const exitosos = jobs.filter(job => (ESTADOS_EXITOSOS as readonly string[]).includes(job.state)).length
  const fallos = jobs.filter(job => job.state === 'FALLIDO').length
  if (exitosos + fallos === 0) return null
  return Math.round((exitosos / (exitosos + fallos)) * 1000) / 10
}

const nombreDe = (job: TrabajoMetrica) => job.printerName || job.destination || 'Sin impresora'

function latencias(jobs: TrabajoMetrica[]) {
  const cola = jobs.map(job => job.queueMs).filter(numero)
  const duracion = jobs.map(job => job.durationMs).filter(numero)
  return {
    muestras: duracion.length,
    promedioQueueMs: promedio(cola),
    promedioDurationMs: promedio(duracion),
    p95QueueMs: percentil(cola, 95),
    p95DurationMs: percentil(duracion, 95),
  }
}

/** Bucket horario (UTC) al que pertenece un instante. */
function horaBucket(fecha: Date): number {
  return Math.floor(fecha.getTime() / HORA_MS) * HORA_MS
}

/**
 * Serie continua de buckets horarios del rango, incluidos los vacíos: el
 * gráfico necesita ver los huecos, no solo las horas con trabajo.
 */
export function seriePorHora(jobs: TrabajoMetrica[], desde: Date, hasta: Date) {
  const inicio = horaBucket(desde)
  const fin = horaBucket(hasta)
  const porHora = new Map<number, { trabajos: number; duraciones: number[] }>()
  for (const job of jobs) {
    const clave = horaBucket(job.enqueuedAt)
    const bucket = porHora.get(clave) ?? { trabajos: 0, duraciones: [] }
    bucket.trabajos += 1
    if (numero(job.durationMs)) bucket.duraciones.push(job.durationMs)
    porHora.set(clave, bucket)
  }
  const serie: Array<{ hora: string; trabajos: number; promedioDurationMs: number | null }> = []
  for (let clave = inicio; clave <= fin; clave += HORA_MS) {
    const bucket = porHora.get(clave)
    serie.push({
      hora: new Date(clave).toISOString(),
      trabajos: bucket?.trabajos ?? 0,
      promedioDurationMs: bucket ? promedio(bucket.duraciones) : null,
    })
  }
  return serie
}

/**
 * Resumen completo del rango. `desde`/`hasta` se devuelven normalizados para
 * que la UI muestre exactamente lo que midió el servidor.
 */
export function resumenImpresion(jobs: TrabajoMetrica[], desde: Date, hasta: Date) {
  const enCola = jobs.filter(job => (ESTADOS_ABIERTOS as readonly string[]).includes(job.state)).length
  const exitosos = jobs.filter(job => (ESTADOS_EXITOSOS as readonly string[]).includes(job.state)).length
  const fallos = jobs.filter(job => job.state === 'FALLIDO').length
  const inciertos = jobs.filter(job => job.state === 'INCIERTO').length

  const grupos = new Map<string, { printerId: string | null; printerName: string; jobs: TrabajoMetrica[] }>()
  for (const job of jobs) {
    const clave = job.printerId || 'sin-impresora'
    const grupo = grupos.get(clave) ?? { printerId: job.printerId, printerName: nombreDe(job), jobs: [] }
    grupo.printerName = job.printerName || grupo.printerName
    grupo.jobs.push(job)
    grupos.set(clave, grupo)
  }
  const porImpresora = [...grupos.values()]
    .map(grupo => ({
      printerId: grupo.printerId,
      printerName: grupo.printerName,
      trabajos: grupo.jobs.length,
      tasaExito: tasaExito(grupo.jobs),
      ...latencias(grupo.jobs),
    }))
    .sort((izquierda, derecha) => derecha.trabajos - izquierda.trabajos || izquierda.printerName.localeCompare(derecha.printerName))

  const ultimos = [...jobs]
    .sort((izquierda, derecha) => derecha.enqueuedAt.getTime() - izquierda.enqueuedAt.getTime())
    .slice(0, 20)
    .map(job => ({
      id: job.id,
      state: job.state,
      // Alias pedido por el contrato de métricas: el resto de la API usa
      // `state`, el reporte de trabajos también expone `status`.
      status: job.state,
      printerId: job.printerId,
      printerName: nombreDe(job),
      destination: job.destination,
      transport: job.transport,
      reference: job.reference,
      enqueuedAt: job.enqueuedAt,
      claimedAt: job.claimedAt,
      confirmedAt: job.confirmedAt,
      queueMs: job.queueMs,
      durationMs: job.durationMs,
    }))

  return {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    totales: { trabajos: jobs.length, exitosos, fallos, inciertos, enCola, tasaExito: tasaExito(jobs) },
    latencias: { global: latencias(jobs), porImpresora },
    serie: seriePorHora(jobs, desde, hasta),
    ultimos,
  }
}

export type ResumenImpresion = ReturnType<typeof resumenImpresion>
