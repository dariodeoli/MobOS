import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { printingApi } from '@/lib/api/printing'
import { esIdBackend } from '@/lib/printing/agent'
import { ticketPruebaTipo } from '@/lib/printing/tickets'

// Comparativa de impresoras: manda el MISMO ticket (con la marca de la corrida)
// a hasta tres impresoras por el camino remoto y cruza los tiempos reales
// (cola y total) que devuelve /api/print/metrics. Ganadora = menor total.
const MAX_COMPARAR = 3
const ESPERA_MAXIMA_MS = 45_000
const INTERVALO_MS = 2_000

const COLOR_RESULTADO = { confirmado: 'green', aceptado: 'blue', incierto: 'orange', fallido: 'red', pendiente: 'slate', reclamado: 'slate' }
const TERMINALES_EXITO = ['ACEPTADO', 'CONFIRMADO']

const ms = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? `${Math.max(0, Math.round(valor))} ms` : '—')
const transporteDe = (fila, job) => job?.transport || (/^(usb|cups):/.test(String(fila.destino || '')) ? 'CUPS' : 'LAN')
const etiquetaEstado = (job) => (job ? String(job.state || '').toLowerCase() : 'en cola')

export default function ImpresionComparativa({ impresoras = [], onAgregar, onGestionarPuentes, usuario = '', equipo = '' }) {
  const [seleccion, setSeleccion] = useState([])
  const [corrida, setCorrida] = useState(null)
  const [metricas, setMetricas] = useState(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState('')

  // Quita de la selección las impresoras que ya no existen o no están activas.
  useEffect(() => {
    setSeleccion((actual) => actual.filter((id) => impresoras.some((impresora) => impresora.id === id && impresora.activa)))
  }, [impresoras])

  const alternar = (impresora) => {
    setError('')
    setSeleccion((actual) => {
      if (actual.includes(impresora.id)) return actual.filter((id) => id !== impresora.id)
      if (actual.length >= MAX_COMPARAR) return actual
      return [...actual, impresora.id]
    })
  }

  const elegidas = useMemo(() => seleccion.map((id) => impresoras.find((impresora) => impresora.id === id)).filter(Boolean), [seleccion, impresoras])
  const sinPuente = elegidas.filter((impresora) => !impresora.bridgeId || !esIdBackend(impresora.id))
  const puedeComparar = elegidas.length >= 2 && sinPuente.length === 0 && !enCurso

  const consultarCorrida = useCallback(async (marca) => {
    const datos = await printingApi.metricas({ reference: marca })
    setMetricas(datos)
    return datos
  }, [])

  // Mientras la corrida está viva, se refresca cada 2 s hasta que todos los
  // trabajos tengan duración medida (o hasta el tope de espera).
  useEffect(() => {
    if (!corrida || !enCurso) return undefined
    let activo = true
    const limite = Date.now() + ESPERA_MAXIMA_MS
    const consultar = async () => {
      try {
        const datos = await consultarCorrida(corrida.marca)
        if (!activo) return
        const completos = corrida.filas.every((fila) => (datos?.ultimos || []).some((job) => job.reference === fila.reference && typeof job.durationMs === 'number'))
        if (completos || Date.now() > limite) setEnCurso(false)
      } catch {
        if (activo && Date.now() > limite) setEnCurso(false)
      }
    }
    consultar()
    const intervalo = setInterval(consultar, INTERVALO_MS)
    return () => { activo = false; clearInterval(intervalo) }
  }, [corrida, enCurso, consultarCorrida])

  async function enviar() {
    if (!puedeComparar) return
    setError('')
    setEnCurso(true)
    setCorrida(null)
    setMetricas(null)
    // Marca única de la corrida: viaja en el ticket y en el `reference` de
    // cada trabajo (prefijo), que es lo que filtra /api/print/metrics.
    const marca = `COMP-${Date.now().toString(36).toUpperCase()}`
    try {
      const filas = []
      for (const [indice, impresora] of elegidas.entries()) {
        const reference = `${marca}-${indice + 1}`
        const ticket = ticketPruebaTipo('corta', {
          ancho: impresora.ancho,
          impresora: impresora.destino,
          nombre: impresora.nombre,
          equipo,
          copias: 1,
          conexion: impresora.conexion,
          usuario,
          marca,
        })
        await printingApi.encolar({
          path: 'REMOTO',
          destination: impresora.destino,
          payload: ticket.base64(),
          printerId: impresora.id,
          kind: 'comparativa',
          validation: ticket.validacion,
          suffix: ticket.sufijo,
          reference,
          idempotencyKey: reference,
          requestedByName: usuario,
          deviceName: equipo,
          mode: impresora.conexion,
          width: impresora.ancho === 58 ? 58 : 80,
          copies: 1,
        })
        filas.push({ reference, printerId: impresora.id, nombre: impresora.nombre, ancho: impresora.ancho, destino: impresora.destino, conexion: impresora.conexion })
      }
      setCorrida({ marca, filas })
      setEnCurso(true)
    } catch (cause) {
      setError(cause?.message || 'No se pudieron encolar las pruebas de la comparativa.')
      setEnCurso(false)
    }
  }

  const filas = useMemo(() => {
    if (!corrida) return []
    const porReference = new Map((metricas?.ultimos || []).map((job) => [job.reference, job]))
    const conMetricas = corrida.filas.map((fila) => ({ ...fila, job: porReference.get(fila.reference) || null }))
    const tiempos = conMetricas.filter((fila) => fila.job && TERMINALES_EXITO.includes(fila.job.state) && typeof fila.job.durationMs === 'number')
    const ganadora = tiempos.length ? Math.min(...tiempos.map((fila) => fila.job.durationMs)) : null
    return conMetricas.map((fila) => ({ ...fila, gana: ganadora !== null && fila.job?.durationMs === ganadora }))
  }, [corrida, metricas])

  const pendientes = enCurso ? filas.filter((fila) => !fila.job || typeof fila.job.durationMs !== 'number').length : 0

  return (
    <Card className="space-y-3" data-testid="comparativa-impresoras">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="trophy" className="h-4 w-4 text-mute" />Comparar impresoras</h3>
          <p className="mt-1 text-sm text-mute">Elegí hasta {MAX_COMPARAR} impresoras y mandá el mismo ticket a todas. La tabla muestra la cola, el total y cuál imprime más rápido.</p>
        </div>
        <Button type="button" onClick={enviar} disabled={!puedeComparar}>{enCurso ? 'Midiendo…' : 'Enviar prueba a todas'}</Button>
      </div>

      {impresoras.length < 2 ? (
        <EmptyState compact icon="printer" title="Necesitás al menos dos impresoras configuradas." description="Agregá la segunda térmica para poder compararlas." action={<Button type="button" variant="outline" onClick={onAgregar}><Icon name="plus" className="h-3.5 w-3.5" />Agregar impresora</Button>} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {impresoras.map((impresora) => {
              const marcada = seleccion.includes(impresora.id)
              const tope = !marcada && seleccion.length >= MAX_COMPARAR
              return (
                <label key={impresora.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${marcada ? 'border-fono/50 bg-fono/10 text-fore' : 'border-ink-600 text-mute hover:text-fore'} ${tope ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-fono)]" checked={marcada} disabled={tope || enCurso} onChange={() => alternar(impresora)} aria-label={`Comparar ${impresora.nombre}`} />
                  <span className="truncate" title={impresora.nombre}>{impresora.nombre}</span>
                  {impresora.bridgeId ? <Badge color="blue">Puente</Badge> : <Badge color="orange">Sin puente</Badge>}
                </label>
              )
            })}
          </div>

          {sinPuente.length > 0 && seleccion.length >= 2 && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
              <Icon name="alert" className="h-4 w-4 text-warn" />
              <span>{sinPuente.length === 1 ? 'Una impresora elegida no está vinculada a un puente' : `${sinPuente.length} impresoras elegidas no están vinculadas a un puente`}: el trabajo no tendría quién lo reclame. Paso que falta: vincular la computadora puente.</span>
              <Button type="button" variant="outline" onClick={onGestionarPuentes}>Gestionar puentes</Button>
            </p>
          )}

          {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}

          {corrida && (
            <div className="space-y-2">
              <p className="text-xs text-mute">Corrida <b className="text-fore">{corrida.marca}</b>{pendientes ? ` · esperando ${pendientes} trabajo(s)…` : ' · completa'}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-sm">
                  <thead>
                    <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
                      <th className="px-2 py-2">Impresora</th>
                      <th className="px-2 py-2">Ancho</th>
                      <th className="px-2 py-2">Transporte</th>
                      <th className="px-2 py-2 text-right">Cola</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => (
                      <tr key={fila.reference} className="border-b border-ink-600/50">
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-2 font-medium">
                            {fila.nombre}
                            {fila.gana && <Badge color="green" title="Menor tiempo total"><Icon name="trophy" className="h-3 w-3" />Ganadora</Badge>}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs text-mute">{fila.ancho} mm</td>
                        <td className="px-2 py-2 text-xs text-mute">{transporteDe(fila, fila.job)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">{ms(fila.job?.queueMs)}</td>
                        <td className="px-2 py-2 text-right text-xs font-semibold tabular-nums">{ms(fila.job?.durationMs)}</td>
                        <td className="px-2 py-2 text-right"><Badge color={COLOR_RESULTADO[etiquetaEstado(fila.job)] || 'slate'}>{etiquetaEstado(fila.job)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
