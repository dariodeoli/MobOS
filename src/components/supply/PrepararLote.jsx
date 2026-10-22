import { useCallback, useEffect, useMemo, useState } from 'react'
import StatGrid from '@/components/shared/StatGrid'
import '@/components/ventas/ventasF3.css'
import '@/components/shared/gestionProfundo.css'
import { estadoEnvioTexto, metodoEnvioTexto } from '@/lib/etiquetasLogistica'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resources } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Skeleton, Stat, useToast } from '@/components/ui'
import EncabezadoFlujo from '@/components/supply/AyudaFlujo'
import PanelEscaneoSeriales from '@/components/supply/PanelEscaneoSeriales'
import { getProductos } from '@/lib/storage'
import CompartirPdf from '@/components/shared/CompartirPdf'
import Icon from '@/components/shared/Icon'
import { lineasDeEnvio, totalPendienteLotes } from '@/lib/lotes'
import { configImpresora } from '@/lib/printing/agent'
import { datosManifiesto, etiquetasDeLote } from '@/lib/printing/manifiesto'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketEtiquetasLote, ticketManifiesto } from '@/lib/printing/tickets'
import { buildEtiquetasLoteHtml, buildManifiestoHtml } from '@/components/shared/OrderReceipt'
import { printHtml } from '@/utils/printHtml'

// Abastecimiento · F3/F4 (#250 §7): IMEI diferido del lote.
// Lista los envíos con unidades pendientes (antes de despachar o en tránsito) y
// permite completarlas escaneando de a una (lector BT/USB o cámara) o pegando
// varias, con la misma validación previa que el backend (Luhn, repetidos,
// cantidad). No mueve stock: eso pasa en la recepción (F5).
// §11: desde el mismo lote salen el manifiesto (va con el transporte) y las
// etiquetas `N de M` de las unidades, con el agente o el diálogo como respaldo.

export default function PrepararLote() {
  const toast = useToast()
  const navigate = useNavigate()
  // #450: llegar con ?lote=<código> abre ese lote ya listo para cargar IMEI.
  const [params, setParams] = useSearchParams()
  const filtroLote = (params.get('lote') || '').trim()
  const [envios, setEnvios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [lineaId, setLineaId] = useState('')
  const [imprimiendo, setImprimiendo] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyShipments.list({ pendientes: 1, limit: 100 })
      const lista = datos?.envios || []
      setEnvios(lista)
      setAbierto((actual) => {
        if (actual) return lista.find((envio) => envio.id === actual.id) || null
        const pedido = filtroLote.toLowerCase()
        return pedido ? lista.find((envio) => envio.id === filtroLote || String(envio.code || '').toLowerCase() === pedido) || null : null
      })
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar los lotes.')
    } finally {
      setCargando(false)
    }
  }, [filtroLote])

  useEffect(() => { cargar() }, [cargar])

  const catalogo = useMemo(() => getProductos(), [])
  const lineasPanel = useMemo(() => lineasDeEnvio(abierto), [abierto])

  async function agregarSerial(serial, { luhnForzado, lineId }) {
    await resources.supplyShipments.update({ id: abierto.id, action: 'scan', lineId, serial, ...(luhnForzado ? { forzarLuhn: true } : {}) })
    await cargar()
  }

  async function agregarVarios(seriales, lineId) {
    await resources.supplyShipments.update({ id: abierto.id, action: 'serials', lineId, serials: seriales })
    await cargar()
  }

  // F3/F4 (#250 §11): desde el lote salen el manifiesto (va con el transporte)
  // y las etiquetas `N de M` de las unidades; la data viene del mismo pedido.
  async function imprimirDelLote(envio, cual) {
    if (!envio?.id || imprimiendo) return
    setImprimiendo(cual)
    try {
      const datos = await resources.supplyShipments.manifest(envio.id)
      const normalizado = datosManifiesto(datos)
      const { ancho } = configImpresora()
      const esEtiquetas = cual === 'etiquetas'
      const etiquetas = esEtiquetas ? etiquetasDeLote(normalizado) : []
      const resultado = await imprimirDocumentoNoFiscal(
        esEtiquetas ? ticketEtiquetasLote(etiquetas, { ancho }) : ticketManifiesto(normalizado, { ancho }),
        {
          tipo: esEtiquetas ? 'etiquetas-lote' : 'manifiesto',
          respaldo: async () => printHtml(await (esEtiquetas
            ? buildEtiquetasLoteHtml(etiquetas, { ancho })
            : buildManifiestoHtml(normalizado, { format: 'a4' }))),
        },
      )
      if (resultado?.ok) {
        toast.success(
          resultado.dialogo ? (esEtiquetas ? 'Etiquetas listas' : 'Manifiesto listo') : (esEtiquetas ? 'Etiquetas enviadas a la impresora.' : 'Manifiesto enviado'),
          esEtiquetas ? `${etiquetas.length} etiqueta(s) · ${normalizado.code}.` : `${normalizado.code} · ${normalizado.resumen.unidades} unidad(es).`,
        )
        return
      }
      if (!resultado?.dialogo) toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } catch (causa) {
      toast.error('No se pudo imprimir', causa?.message || 'Reintentá en un momento.')
    } finally {
      setImprimiendo('')
    }
  }

  const totalPendientes = totalPendienteLotes(envios)

  return (
    <div className="compras-flujo gp ventas-f3 space-y-4" data-testid="preparar-lote">
      <EncabezadoFlujo
        className="min-w-0 w-full"
        paso="lotes"
        onIr={(paso) => navigate(paso.ruta)}
        accion={(
          <Button type="button" variant="outline" data-testid="flujo-actualizar" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
          </Button>
        )}
      />
      {envios.length > 0 && (
        <StatGrid testId="preparar-lote-resumen" etiqueta="Resumen de lotes">
          <Stat compact label="Lotes" valor={`${envios.length} lote${envios.length === 1 ? '' : 's'}`} />
          <Stat compact label="Pendientes" valor={`${totalPendientes} IMEI pendiente${totalPendientes === 1 ? '' : 's'}`} valorClassName={totalPendientes > 0 ? 'text-warn' : ''} />
        </StatGrid>
      )}

      {filtroLote && (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="preparar-lote-filtro">
          <Badge color="blue">Lote {filtroLote}</Badge>
          <button type="button" className="min-h-11 underline" onClick={() => setParams({}, { replace: true })}>Ver todos los lotes</button>
        </p>
      )}
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
                      {envio.method ? ` · ${metodoEnvioTexto(envio.method)}` : ''}{envio.status ? ` · ${estadoEnvioTexto(envio.status)}` : ''}
                    </p>
                  </div>
                  <Badge color="orange">{envio.pendientes} IMEI pendiente{envio.pendientes === 1 ? '' : 's'}</Badge>
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant={expandida ? 'outline' : 'primary'}
                    onClick={() => { setAbierto(expandida ? null : envio); setLineaId('') }}
                  >
                    {expandida ? 'Cerrar' : 'Cargar IMEI'}
                  </Button>
                </div>

                {expandida && (
                  <div className="mt-3 space-y-3 border-t border-ink-600 pt-3" data-testid="preparar-lote-activa">
                    <PanelEscaneoSeriales
                      idBase="preparar-lote"
                      lineas={lineasPanel}
                      lineaId={lineaId}
                      onLinea={setLineaId}
                      productos={catalogo}
                      agregar={agregarSerial}
                      agregarVarios={agregarVarios}
                      ariaEntrada="IMEI del lote a escanear"
                      ariaPegado="IMEI del lote para pegar"
                    />
                    <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => imprimirDelLote(envio, 'manifiesto')}
                        disabled={Boolean(imprimiendo)}
                        data-testid="preparar-lote-manifiesto"
                      >
                        <Icon name="printer" className="h-3.5 w-3.5" />{imprimiendo === 'manifiesto' ? 'Preparando…' : 'Manifiesto'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => imprimirDelLote(envio, 'etiquetas')}
                        disabled={Boolean(imprimiendo)}
                        data-testid="preparar-lote-etiquetas"
                      >
                        <Icon name="tag" className="h-3.5 w-3.5" />{imprimiendo === 'etiquetas' ? 'Preparando…' : 'Etiquetas del lote'}
                      </Button>
                      <span data-testid="preparar-lote-manifiesto-pdf">
                        <CompartirPdf
                          construirHtml={async () => {
                            const datos = await resources.supplyShipments.manifest(envio.id)
                            return buildManifiestoHtml(datosManifiesto(datos), { format: 'a4' })
                          }}
                          nombre={`manifiesto-${envio.code || 'lote'}`}
                          titulo="Manifiesto del lote"
                          texto={`Manifiesto ${envio.code || ''}`}
                          formato="a4"
                          disabled={Boolean(imprimiendo)}
                        />
                      </span>
                      <span data-testid="preparar-lote-etiquetas-pdf">
                        <CompartirPdf
                          construirHtml={async () => {
                            const datos = await resources.supplyShipments.manifest(envio.id)
                            const { ancho } = configImpresora()
                            return buildEtiquetasLoteHtml(etiquetasDeLote(datosManifiesto(datos)), { ancho })
                          }}
                          nombre={`etiquetas-lote-${envio.code || 'lote'}`}
                          titulo="Etiquetas del lote"
                          texto={`Etiquetas ${envio.code || ''}`}
                          formato={`thermal-${configImpresora().ancho}`}
                          disabled={Boolean(imprimiendo)}
                        />
                      </span>
                    </div>
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
