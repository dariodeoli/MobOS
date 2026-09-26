import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, EmptyState, Input, Skeleton, Textarea, useToast } from '@/components/ui'
import CameraScan from '@/components/shared/CameraScan'
import Icon from '@/components/shared/Icon'
import { analizarSerial, textoMotivo, validarLote } from '@/lib/escanerSeriales'

// Abastecimiento · F3 (#250 §7): preparación de la compra.
// Lista las compras con IMEI por completar y permite cargarlos escaneando de a
// uno (lector BT/USB o cámara) o pegando varios, con la validación previa del
// lote (Luhn, repetidos, ya cargados, cantidad) espejo de la del backend.

export default function PrepararCompra() {
  const toast = useToast()
  const esDemo = isDemoRuntime
  const [compras, setCompras] = useState([])
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
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
      const datos = await resources.supplyPurchases.list({ pendientes: 1 })
      const lista = datos?.compras || []
      setCompras(lista)
      setTotales(datos?.totales || null)
      setAbierta((actual) => {
        const vigente = lista.find((compra) => compra.id === actual?.id)
        if (vigente) return vigente
        // La compra completa sale de «pendientes»: se conserva abierta (con las
        // líneas completas) hasta que la persona la cierre.
        if (actual) return { ...actual, completa: true, lines: (actual.lines || []).map((fila) => ({ ...fila, faltan: 0 })) }
        return null
      })
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las compras.')
    } finally {
      setCargando(false)
    }
  }, [esDemo])

  useEffect(() => { cargar() }, [cargar])

  // La compra abierta se sigue mostrando aunque ya no esté en «pendientes»
  // (queda con las líneas completas hasta que la cierren).
  const visibles = useMemo(() => {
    if (!abierta) return compras
    return compras.some((compra) => compra.id === abierta.id) ? compras : [abierta, ...compras]
  }, [compras, abierta])

  const linea = useMemo(() => (abierta?.lines || []).find((fila) => fila.id === lineaId) || (abierta?.lines || []).find((fila) => fila.faltan > 0) || (abierta?.lines || [])[0] || null, [abierta, lineaId])
  const cargadosLinea = useMemo(() => (linea?.serials || []).map((fila) => fila.serial), [linea])

  async function escanear(serialBruto) {
    if (!abierta || !linea || busy) return
    const analisis = analizarSerial(serialBruto)
    if (!analisis.ok) {
      setAviso(`${analisis.serial || 'Código'}: ${textoMotivo(analisis.motivo)}`)
      return
    }
    setBusy(true)
    setAviso('')
    try {
      const datos = await resources.supplyPurchases.update({ id: abierta.id, action: 'scan', lineId: linea.id, serial: analisis.serial })
      setEntrada('')
      if (datos?.aviso) toast.info('Aviso del proveedor', datos.aviso)
      cargar()
    } catch (causa) {
      setAviso(causa?.message || 'El IMEI no se pudo cargar.')
    } finally {
      setBusy(false)
    }
  }

  async function pegarLote() {
    if (!abierta || !linea || busy) return
    const { validos, errores } = validarLote({ entradas: pegado, yaCargados: cargadosLinea, limite: Math.max(0, Number(linea.faltan) || 0) })
    if (!validos.length) {
      setAviso(errores.map((fila) => `${fila.serial}: ${textoMotivo(fila.motivo)}`).join(' · ') || 'No hay códigos para cargar.')
      return
    }
    setBusy(true)
    try {
      await resources.supplyPurchases.update({ id: abierta.id, action: 'serials', lineId: linea.id, serials: validos })
      setPegado('')
      setVerPegado(false)
      const rechazados = errores.length ? ` · no cargados: ${errores.map((fila) => `${fila.serial} (${textoMotivo(fila.motivo)})`).join(', ')}` : ''
      setAviso(`${validos.length} cargado(s)${rechazados}`)
      toast.success('IMEI cargados', `${validos.length} serial(es) en la línea.`)
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
        <h2 className="font-semibold">Preparar compra</h2>
        <p className="mt-1 text-sm text-mute">La preparación de IMEI trabaja con las compras de una cuenta real.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4" data-testid="preparar-compra">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Preparar compra</h2>
            <p className="mt-1 text-sm text-mute">
              Compras con IMEI por completar: escaneá de a uno (lector Bluetooth/USB o cámara) o pegá varios.
              Los IMEI se validan con Luhn y no se aceptan repetidos.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
          </Button>
        </div>
        {totales && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="blue">{totales.compras} compra{totales.compras === 1 ? '' : 's'}</Badge>
            <Badge color="orange">{totales.pendientes} IMEI pendiente{totales.pendientes === 1 ? '' : 's'}</Badge>
          </p>
        )}
      </Card>

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !compras.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !compras.length ? (
        <EmptyState icon="box" title="No hay compras por preparar." description="Cuando una compra tenga IMEI pendientes, aparece acá." />
      ) : (
        <div className="space-y-2.5">
          {visibles.map((compra) => {
            const pendientes = (compra.lines || []).reduce((suma, fila) => suma + Number(fila.faltan || 0), 0)
            const expandida = abierta?.id === compra.id
            return (
              <Card key={compra.id} className="p-3.5" data-testid="preparar-compra-fila">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{compra.code} <span className="font-normal text-mute">· {compra.supplierName || compra.supplier?.name || 'Sin proveedor'}</span></p>
                    <p className="mt-1 text-xs text-mute">{compra.units || compra.unidades || 0} unidad(es) · destino {compra.branch?.name || '—'}</p>
                  </div>
                  <Badge color={pendientes > 0 ? 'orange' : 'green'}>{pendientes} IMEI pendiente{pendientes === 1 ? '' : 's'}</Badge>
                </div>
                <div className="mt-3">
                  <Button type="button" variant={expandida ? 'outline' : 'primary'} onClick={() => { setAbierta(expandida ? null : compra); setLineaId(''); setAviso('') }}>
                    {expandida ? 'Cerrar' : 'Preparar IMEI'}
                  </Button>
                </div>

                {expandida && (
                  <div className="mt-3 space-y-3 border-t border-ink-600 pt-3">
                    {(compra.lines || []).map((fila) => (
                      <label key={fila.id} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={`linea-${compra.id}`} checked={linea?.id === fila.id} onChange={() => { setLineaId(fila.id); setAviso('') }} aria-label={`Línea ${fila.product?.name || fila.productId}`} />
                        <span className="min-w-0 flex-1 truncate">{fila.product?.name || 'Producto'}{fila.product?.capacity ? ` · ${fila.product.capacity}` : ''}</span>
                        <span className="text-xs text-mute tabular-nums">{(fila.serials || []).length}/{fila.quantity}</span>
                        {Number(fila.faltan) > 0
                          ? <Badge color="orange">{fila.faltan} faltan</Badge>
                          : <Badge color="green">Completa</Badge>}
                      </label>
                    ))}

                    {linea && linea.faltan > 0 && (
                      <>
                        <form onSubmit={(evento) => { evento.preventDefault(); escanear(entrada) }} className="flex flex-wrap items-center gap-2">
                          <Input
                            autoFocus
                            value={entrada}
                            onChange={(evento) => setEntrada(evento.target.value)}
                            placeholder="Escaneá o escribí el IMEI…"
                            aria-label="IMEI a escanear"
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
                              aria-label="IMEI para pegar"
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
                    {linea && linea.faltan <= 0 && <p className="text-sm text-ok">Línea completa: todos los IMEI cargados.</p>}
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
