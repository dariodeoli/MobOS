import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, FormField, Input, Select, Textarea, useResultado } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { resources } from '@/lib/api'
import { suppliersApi } from '@/lib/api/suppliers'
import { cotizacionReferencia } from '@/lib/fx'
import { configImpresora, imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { ticketEtiquetasLote } from '@/lib/printing/tickets'
import { buildEtiquetasLoteHtml } from '@/components/shared/OrderReceipt'
import { claveOperacion, etiquetasDeLlegada, imeiConfirmable, nombreModelo, puedeConfirmar } from '@/lib/llegada'
import GrillaPegado from './GrillaPegado'
import ResumenLlegada from './ResumenLlegada'

// Llegada de mercadería (#408 G): el lote como la planilla. Fecha, moneda y
// cotización (referencial editable) → pegar las filas → grilla con los hallazgos
// y su arreglo → «Confirmar llegada» (bloqueado con errores) → resumen,
// etiquetas e IMEI pendientes. Nada toca el stock hasta confirmar.

const hoy = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}
const soloNumero = (valor) => String(valor || '').replace(/[^\d.,]/g, '')
const aNumero = (valor) => Number(String(valor || '').replace(/\./g, '').replace(',', '.'))

// IMEI pendientes después de confirmar: cada uno con su campo en la misma fila.
function ImeiPendientes({ lineas, onCompletar }) {
  const [valores, setValores] = useState({})
  const [ocupada, setOcupada] = useState('')
  const [errores, setErrores] = useState({})
  if (!lineas.length) return null
  async function cargar(linea, confirmar) {
    setOcupada(linea.id)
    setErrores((previo) => ({ ...previo, [linea.id]: '' }))
    try {
      await onCompletar(linea.id, valores[linea.id] || '', confirmar)
    } catch (causa) {
      setErrores((previo) => ({ ...previo, [linea.id]: causa?.message || 'No se pudo cargar el IMEI.' }))
    } finally {
      setOcupada('')
    }
  }
  return (
    <section className="space-y-2" aria-label="IMEI pendientes" data-testid="llegada-imei-pendientes">
      <h3 className="text-sm font-semibold">IMEI pendientes</h3>
      <ul className="space-y-1.5">
        {lineas.map((linea) => (
          <li key={linea.id} className="rounded-lg border border-ink-600 bg-warn/10 p-2">
            <form className="flex flex-wrap items-center gap-2" onSubmit={(evento) => { evento.preventDefault(); cargar(linea, false) }}>
              <span className="min-w-0 flex-1 basis-56 truncate text-sm" title={nombreModelo(linea)}>{nombreModelo(linea)}</span>
              <Input aria-label={`IMEI de ${nombreModelo(linea)}`} className="h-11 w-48 font-mono text-sm md:h-8" value={valores[linea.id] || ''} onChange={(evento) => setValores((previo) => ({ ...previo, [linea.id]: evento.target.value }))} placeholder="IMEI o serie" autoComplete="off" disabled={ocupada === linea.id} />
              <Button type="submit" size="sm" disabled={ocupada === linea.id || !(valores[linea.id] || '').trim()}>Cargar</Button>
              {imeiConfirmable(valores[linea.id]) && <Button type="button" size="sm" variant="outline" onClick={() => cargar(linea, true)} disabled={ocupada === linea.id}>El IMEI es correcto</Button>}
            </form>
            {errores[linea.id] && <p role="alert" className="mt-1 text-xs text-bad">{errores[linea.id]}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function LlegadaLote({ onVolver }) {
  const avisar = useResultado()
  const [fecha, setFecha] = useState(hoy)
  const [moneda, setMoneda] = useState('USD')
  const [cotizacion, setCotizacion] = useState('')
  const [origenCotizacion, setOrigenCotizacion] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [proveedorIds, setProveedorIds] = useState([])
  const [envios, setEnvios] = useState([])
  const [envioId, setEnvioId] = useState('')
  const [sucursales, setSucursales] = useState([])
  const [texto, setTexto] = useState('')
  const [pegando, setPegando] = useState(true)
  const [llegada, setLlegada] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const claveCrear = useRef(claveOperacion('llegada'))
  const claveConfirmar = useRef(claveOperacion('confirma'))
  const [imprimiendo, setImprimiendo] = useState(false)

  useEffect(() => {
    let vigente = true
    cotizacionReferencia().then((valor) => {
      if (!vigente || !valor) return
      setCotizacion((actual) => actual || String(Math.round(valor)))
      setOrigenCotizacion('Referencial BCP del día')
    })
    suppliersApi.list().then((filas) => { if (vigente) setProveedores((Array.isArray(filas) ? filas : filas?.suppliers || []).filter((fila) => fila.isActive !== false)) }).catch(() => {})
    resources.supplyShipments.list({ pendientes: 1 }).then((datos) => { if (vigente) setEnvios(datos?.envios || []) }).catch(() => {})
    resources.inventoryBranches.list().then((filas) => { if (vigente) setSucursales(Array.isArray(filas) ? filas : []) }).catch(() => {})
    return () => { vigente = false }
  }, [])

  const confirmada = llegada?.status === 'CONFIRMADA'
  const confirmable = puedeConfirmar(llegada)
  const destinosOtros = useMemo(() => sucursales.filter((sucursal) => sucursal.id !== llegada?.branchId), [sucursales, llegada])
  const pendientes = useMemo(() => (llegada?.lines || []).filter((linea) => linea.destination === 'FALTA_IMEI' && !linea.unitId), [llegada])
  const valida = fecha && (moneda === 'PYG' || aNumero(cotizacion) > 0)

  const interpretar = useCallback(async () => {
    if (!texto.trim() || ocupado) return
    setOcupado(true)
    setError('')
    try {
      let actual = llegada
      if (!actual) {
        actual = await resources.supplyArrivals.create({
          arrivedAt: fecha, currency: moneda, source: 'PEGADO', idempotencyKey: claveCrear.current,
          ...(moneda === 'USD' ? { exchangeRatePyg: aNumero(cotizacion) } : {}),
          ...(proveedorIds.length ? { supplierIds: proveedorIds } : {}),
          ...(envioId ? { shipmentId: envioId } : {}),
        })
      }
      const parseada = await resources.supplyArrivals.parse(actual.id, texto)
      setLlegada(parseada)
      setPegando(false)
    } catch (causa) {
      setError(causa?.message || 'No se pudo interpretar el pegado.')
    } finally {
      setOcupado(false)
    }
  }, [texto, ocupado, llegada, fecha, moneda, cotizacion, proveedorIds, envioId])

  async function parcharLinea(lineId, cuerpo) {
    setError('')
    try {
      const actualizada = await resources.supplyArrivals.patchLine(llegada.id, { lineId, ...cuerpo })
      setLlegada(actualizada)
    } catch (causa) {
      setError(causa?.message || 'No se pudo guardar el cambio.')
    }
  }

  async function confirmar() {
    if (!confirmable || ocupado) return
    setOcupado(true)
    setError('')
    try {
      setLlegada(await resources.supplyArrivals.confirmar(llegada.id, claveConfirmar.current))
    } catch (causa) {
      setError(causa?.message || 'No se pudo confirmar la llegada.')
      try { setLlegada(await resources.supplyArrivals.get(llegada.id)) } catch { /* el error de confirmar ya se muestra */ }
    } finally {
      setOcupado(false)
    }
  }

  async function completarImei(lineId, serial, confirmar) {
    const actualizada = await resources.supplyArrivals.completeSerial(lineId, serial, confirmar)
    // La API devuelve la llegada completa; si devolviera otra forma, se recarga.
    setLlegada(actualizada?.lines ? actualizada : await resources.supplyArrivals.get(llegada.id))
  }

  async function imprimirEtiquetas() {
    const lista = etiquetasDeLlegada(llegada.lines, llegada.code)
    if (!lista.length || imprimiendo) return
    setImprimiendo(true)
    try {
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumento(ticketEtiquetasLote(lista, { ancho, compra: llegada.code }), { tipo: 'etiquetas-lote' })
      if (resultado?.ok) {
        if (resultado.encolado) avisar.impreso('Las etiquetas', resultado.remoto ? 'Las imprime el puente cuando las reclame.' : 'La impresora no respondió; se reintenta solo.')
        else avisar.impreso('Las etiquetas', `${lista.length} etiqueta(s) · ${llegada.code}.`)
        return
      }
      if (puedeCaerAlDialogo(resultado)) {
        await imprimirConDialogo(await buildEtiquetasLoteHtml(lista, { ancho, compra: llegada.code }))
        return
      }
      avisar.fallo('imprimir', resultado?.error || 'Revisá la impresora.')
    } finally {
      setImprimiendo(false)
    }
  }

  const alternarProveedor = (id) => setProveedorIds((actual) => (actual.includes(id) ? actual.filter((item) => item !== id) : [...actual, id]))

  // ── Llegada confirmada ──────────────────────────────────────────────────
  if (confirmada) {
    return (
      <div className="space-y-4" data-testid="llegada-confirmada">
        <Card className="space-y-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Llegada {llegada.code}</h2>
            <Button type="button" variant="outline" onClick={onVolver}>Volver a Recepción</Button>
          </div>
          <ResumenLlegada
            confirmada
            resumen={llegada.summary}
            acciones={(
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={imprimirEtiquetas} disabled={imprimiendo || !etiquetasDeLlegada(llegada.lines, llegada.code).length} data-testid="llegada-imprimir">
                  <Icon name="printer" className="h-3.5 w-3.5" />{imprimiendo ? 'Preparando…' : 'Imprimir etiquetas'}
                </Button>
              </div>
            )}
          />
          <ImeiPendientes lineas={pendientes} onCompletar={completarImei} />
        </Card>
        <GrillaPegado llegada={llegada} sucursales={destinosOtros} onPatch={parcharLinea} soloLectura />
      </div>
    )
  }

  // ── Borrador: datos del lote, pegado y grilla ───────────────────────────
  return (
    <div className="space-y-4" data-testid="llegada-lote">
      <Card className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{llegada ? `Llegada ${llegada.code}` : 'Nueva llegada'}</h2>
          <Button type="button" variant="outline" onClick={onVolver} disabled={ocupado}><Icon name="arrowLeft" className="h-3.5 w-3.5" />Volver</Button>
        </div>

        {llegada ? (
          <p className="text-sm text-mute" data-testid="llegada-datos">
            {llegada.arrivedAt ? new Date(llegada.arrivedAt).toLocaleDateString('es-PY', { timeZone: 'UTC' }) : fecha} · {llegada.currency}
            {llegada.currency === 'USD' && llegada.exchangeRatePyg ? ` a Gs. ${Number(llegada.exchangeRatePyg).toLocaleString('es-PY')}` : ''}
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Fecha de llegada" className="md:w-44">
              <Input type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
            </FormField>
            <FormField label="Moneda" className="md:w-28">
              <Select value={moneda} onChange={(evento) => setMoneda(evento.target.value)} aria-label="Moneda del lote">
                <option value="USD">USD</option>
                <option value="PYG">Gs.</option>
              </Select>
            </FormField>
            {moneda === 'USD' && (
              <FormField label="Cotización (Gs. por USD)" hint={origenCotizacion || 'Cargala a mano'} className="md:w-52">
                <Input inputMode="decimal" value={cotizacion} onChange={(evento) => setCotizacion(soloNumero(evento.target.value))} placeholder="7500" aria-label="Cotización USD a guaraníes" />
              </FormField>
            )}
            {envios.length > 0 && (
              <FormField label="Envío (opcional)" className="md:w-56">
                <Select value={envioId} onChange={(evento) => setEnvioId(evento.target.value)} aria-label="Envío esperado">
                  <option value="">Sin envío</option>
                  {envios.map((envio) => <option key={envio.id} value={envio.id}>{envio.code}</option>)}
                </Select>
              </FormField>
            )}
          </div>
        )}

        {!llegada && proveedores.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Proveedores del lote">
            <span className="text-xs text-mute">Proveedores</span>
            {proveedores.map((proveedor) => {
              const activo = proveedorIds.includes(proveedor.id)
              return (
                <button key={proveedor.id} type="button" aria-pressed={activo} onClick={() => alternarProveedor(proveedor.id)} title={proveedor.name} className={`min-h-11 rounded-full border px-3 text-xs md:min-h-7 ${activo ? 'border-accent bg-accent/10 text-fore' : 'border-ink-600 text-mute hover:text-fore'}`}>
                  {proveedor.code || proveedor.name}
                </button>
              )
            })}
          </div>
        )}

        {pegando ? (
          <div className="space-y-2">
            <Textarea
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder="Pegá las filas de la planilla"
              aria-label="Pegá las filas de la planilla"
              className="min-h-48 w-full font-mono text-xs md:min-h-56"
              spellCheck={false}
              data-testid="llegada-pegado"
            />
            <p className="text-xs text-mute">Fechas en filas aparte abren un bloque; luego modelo, IMEI o serie, sigla del proveedor, costo y nota separados por tabulación.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={interpretar} disabled={ocupado || !texto.trim() || !valida} data-testid="llegada-interpretar">
                {ocupado ? 'Interpretando…' : 'Interpretar pegado'}
              </Button>
              {llegada && <Button type="button" variant="outline" onClick={() => setPegando(false)} disabled={ocupado}>Cancelar</Button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm" data-testid="llegada-pegado-listo">
            <span><b className="tabular-nums">{llegada?.lines?.length || 0}</b> filas interpretadas</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setPegando(true)} disabled={ocupado}>Volver a pegar</Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad" data-testid="llegada-error">{error}</p>}
      </Card>

      {llegada && !pegando && (llegada.lines || []).length > 0 && (
        <>
          <GrillaPegado llegada={llegada} sucursales={destinosOtros} onPatch={parcharLinea} />
          <ResumenLlegada resumen={llegada.summary} confirmable={confirmable} onConfirmar={confirmar} ocupado={ocupado} />
        </>
      )}
      {llegada && !pegando && !(llegada.lines || []).length && (
        <Badge color="orange">No se reconoció ninguna fila: revisá el pegado.</Badge>
      )}
    </div>
  )
}
