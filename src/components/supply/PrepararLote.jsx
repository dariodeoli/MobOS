import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, EmptyState, Input, Skeleton, Textarea, useToast } from '@/components/ui'
import CameraScan from '@/components/shared/CameraScan'
import Icon from '@/components/shared/Icon'
import { analizarSerial, textoMotivo, validarLote } from '@/lib/escanerSeriales'
import { etiquetaLineaDeLote, pendientesDeEnvio, serialesDeEnvio, totalPendienteLotes } from '@/lib/lotes'

// Abastecimiento · F3/F4 (#250 §7): IMEI diferido del lote.
// Lista los envíos con unidades pendientes (antes de despachar o en tránsito) y
// permite completarlas escaneando de a una (lector BT/USB o cámara) o pegando
// varias, con la misma validación previa que el backend (Luhn, repetidos,
// cantidad). No mueve stock: eso pasa en la recepción (F5).

export default function PrepararLote() {
  const toast = useToast()
  const esDemo = isDemoRuntime
  const [envios, setEnvios] = useState([])
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [lineaId, setLineaId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [pegado, setPegado] = useState('')
  const [verPegado, setVerPegado] = useState(false)
  const [camara, setCamara] = useState(false)
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (esDemo) return
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyShipments.list({ pendientes: 1, limit: 100 })
      const lista = datos?.envios || []
      setEnvios(lista)
      setAbierto((actual) => (actual ? lista.find((envio) => envio.id === actual.id) || null : null))
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar los lotes.')
    } finally {
      setCargando(false)
    }
  }, [esDemo])

  useEffect(() => { cargar() }, [cargar])

  const lineas = useMemo(() => pendientesDeEnvio(abierto), [abierto])
  const linea = useMemo(() => lineas.find((fila) => fila.lineId === lineaId) || lineas[0] || null, [lineas, lineaId])
  const cargadosLinea = useMemo(() => serialesDeEnvio(abierto, linea?.lineId), [abierto, linea])

  async function escanear(serialBruto) {
    if (!abierto || !linea || busy) return
    const analisis = analizarSerial(serialBruto)
    if (!analisis.ok) {
      setAviso(`${analisis.serial || 'Código'}: ${textoMotivo(analisis.motivo)}`)
      return
    }
    setBusy(true)
    setAviso('')
    try {
      await resources.supplyShipments.update({ id: abierto.id, action: 'scan', lineId: linea.lineId, serial: analisis.serial })
      setEntrada('')
      cargar()
    } catch (causa) {
      setAviso(causa?.message || 'El IMEI no se pudo cargar al lote.')
    } finally {
      setBusy(false)
    }
  }

  async function pegarLote() {
    if (!abierto || !linea || busy) return
    const { validos, errores } = validarLote({ entradas: pegado, yaCargados: cargadosLinea, limite: linea.cantidad })
    if (!validos.length) {
      setAviso(errores.map((fila) => `${fila.serial}: ${textoMotivo(fila.motivo)}`).join(' · ') || 'No hay códigos para cargar.')
      return
    }
    setBusy(true)
    try {
      await resources.supplyShipments.update({ id: abierto.id, action: 'serials', lineId: linea.lineId, serials: validos })
      setPegado('')
      setVerPegado(false)
      const rechazados = errores.length ? ` · no cargados: ${errores.map((fila) => `${fila.serial} (${textoMotivo(fila.motivo)})`).join(', ')}` : ''
      setAviso(`${validos.length} cargado(s)${rechazados}`)
      toast.success('IMEI del lote', `${validos.length} serial(es) cargados.`)
      cargar()
    } catch (causa) {
      setAviso(causa?.message || 'No se pudo cargar el lote.')
    } finally {
      setBusy(false)
    }
  }

  if (esDemo) {
    return (
      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Preparar lote</h2>
        <p className="mt-1 text-sm text-mute">El IMEI diferido del lote trabaja con los envíos de una cuenta real.</p>
      </Card>
    )
  }

  const totalPendientes = totalPendienteLotes(envios)

  return (
    <div className="space-y-4" data-testid="preparar-lote">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Preparar lote</h2>
            <p className="mt-1 text-sm text-mute">
              Lotes con IMEI por completar: se cargan antes de despachar o en tránsito, escaneando de a uno (lector
              Bluetooth/USB o cámara) o pegando varios. La recepción (F5) también puede completarlos.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
          </Button>
        </div>
        {envios.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="blue">{envios.length} lote{envios.length === 1 ? '' : 's'}</Badge>
            <Badge color="orange">{totalPendientes} IMEI pendiente{totalPendientes === 1 ? '' : 's'}</Badge>
          </p>
        )}
      </Card>

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !envios.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !envios.length ? (
        <EmptyState icon="truck" title="No hay lotes con IMEI pendientes." description="Cuando un despacho tenga unidades sin IMEI, aparece acá para completarlas." />
      ) : (
        <div className="space-y-2.5">
          {envios.map((envio) => {
            const expandida = abierto?.id === envio.id
            return (
              <Card key={envio.id} className="p-3.5" data-testid="preparar-lote-fila">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {envio.code}
                      <span className="font-normal text-mute"> · {envio.purchase?.supplierName || 'Sin proveedor'}</span>
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      {envio.purchase?.code ? `Compra ${envio.purchase.code} · ` : ''}{envio.unidades || 0} unidad(es) · destino {envio.destinationBranch?.name || '—'}
                      {envio.method ? ` · ${envio.method}` : ''}{envio.status ? ` · ${envio.status}` : ''}
                    </p>
                  </div>
                  <Badge color="orange">{envio.pendientes} IMEI pendiente{envio.pendientes === 1 ? '' : 's'}</Badge>
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant={expandida ? 'outline' : 'primary'}
                    onClick={() => { setAbierto(expandida ? null : envio); setLineaId(''); setAviso('') }}
                  >
                    {expandida ? 'Cerrar' : 'Cargar IMEI'}
                  </Button>
                </div>

                {expandida && (
                  <div className="mt-3 space-y-3 border-t border-ink-600 pt-3" data-testid="preparar-lote-activa">
                    {lineas.map((fila) => (
                      <label key={fila.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`linea-lote-${envio.id}`}
                          checked={linea?.lineId === fila.lineId}
                          onChange={() => { setLineaId(fila.lineId); setAviso('') }}
                          aria-label={`Línea ${etiquetaLineaDeLote(fila)}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{etiquetaLineaDeLote(fila)}</span>
                        <Badge color="orange">{fila.cantidad} pendiente{fila.cantidad === 1 ? '' : 's'}</Badge>
                      </label>
                    ))}

                    {linea && (
                      <>
                        <form onSubmit={(evento) => { evento.preventDefault(); escanear(entrada) }} className="flex flex-wrap items-center gap-2">
                          <Input
                            autoFocus
                            value={entrada}
                            onChange={(evento) => setEntrada(evento.target.value)}
                            placeholder="Escaneá o escribí el IMEI…"
                            aria-label="IMEI del lote a escanear"
                            className="min-w-0 flex-1"
                          />
                          <Button type="submit" disabled={busy || !entrada.trim()}>Cargar</Button>
                          <Button type="button" variant="outline" onClick={() => setCamara((valor) => !valor)}>
                            <Icon name="image" className="h-3.5 w-3.5" />Cámara
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setVerPegado((valor) => !valor)}>Pegar varios</Button>
                        </form>
                        {camara && <CameraScan continuous onDetected={escanear} onClose={() => setCamara(false)} />}
                        {verPegado && (
                          <div className="space-y-2">
                            <Textarea
                              value={pegado}
                              onChange={(evento) => setPegado(evento.target.value)}
                              placeholder="Pegá los IMEI separados por coma, espacio o salto de línea…"
                              aria-label="IMEI del lote para pegar"
                              className="min-h-24 w-full"
                            />
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" onClick={() => { setVerPegado(false); setPegado('') }} disabled={busy}>Cerrar</Button>
                              <Button type="button" onClick={pegarLote} disabled={busy || !pegado.trim()}>{busy ? 'Cargando…' : 'Cargar lote'}</Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {aviso && <p role="status" className="text-sm text-warn">{aviso}</p>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
