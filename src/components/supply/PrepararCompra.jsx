import './compras.css'
import StatGrid from '@/components/shared/StatGrid'
import '@/components/ventas/ventasF3.css'
import '@/components/shared/gestionProfundo.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resources } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Skeleton, Stat, useToast } from '@/components/ui'
import EncabezadoFlujo from '@/components/supply/AyudaFlujo'
import PanelEscaneoSeriales from '@/components/supply/PanelEscaneoSeriales'
import { getProductos } from '@/lib/storage'
import EtiquetasPreparacion from '@/components/supply/EtiquetasPreparacion'
import Icon from '@/components/shared/Icon'
import { printHtml } from '@/utils/printHtml'
import { configImpresora } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketEtiquetasLote } from '@/lib/printing/tickets'
import { buildEtiquetasLoteHtml } from '@/components/shared/OrderReceipt'
import { etiquetaPorSerial } from '@/lib/printing/etiquetaLote'

// Abastecimiento · F3 (#250 §7): preparación de la compra.
// Lista las compras con IMEI por completar y permite cargarlos escaneando de a
// uno (lector BT/USB o cámara) o pegando varios, con la validación previa del
// lote (Luhn, repetidos, ya cargados, cantidad) espejo de la del backend.

export default function PrepararCompra() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // #450: «Ir a Preparar compra» desde Recepción/Por comprar llega con la compra
  // pedida (código o id): se muestra esa compra aunque ya no tenga pendientes.
  const filtroCompra = (params.get('compra') || '').trim()
  const [compras, setCompras] = useState([])
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [lineaId, setLineaId] = useState('')
  const [etiquetasDe, setEtiquetasDe] = useState(null)
  const [etiquetasBusy, setEtiquetasBusy] = useState('')
  const [ultimoSerial, setUltimoSerial] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyPurchases.list(filtroCompra ? { limit: 200 } : { pendientes: 1 })
      const todas = datos?.compras || []
      const buscada = filtroCompra.toLowerCase()
      const lista = filtroCompra ? todas.filter((compra) => compra.id === filtroCompra || String(compra.code || '').toLowerCase() === buscada) : todas
      setCompras(lista)
      setTotales(filtroCompra
        ? { compras: lista.length, pendientes: lista.reduce((suma, compra) => suma + (compra.lines || []).reduce((total, fila) => total + Number(fila.faltan || 0), 0), 0) }
        : datos?.totales || null)
      setAbierta((actual) => {
        if (filtroCompra && !actual && lista.length === 1) return lista[0]
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
  }, [filtroCompra])

  useEffect(() => { cargar() }, [cargar])

  // F3 (#250 §11): las etiquetas de la preparación (una por unidad comprada,
  // `PRODUCTO n de N`, IMEI o pendiente y el lote cuando la compra lo tiene).
  // Salen por el agente/puente y, si el fallo es claro, por el diálogo.
  async function imprimirEtiquetas(compra, { serial = '' } = {}) {
    if (!compra || etiquetasBusy) return
    setEtiquetasBusy(compra.id)
    try {
      const datos = await resources.supplyPurchases.labels(compra.id)
      const todas = datos?.etiquetas || []
      // Sin serial sale la tira completa; con serial, solo esa unidad (reimpresión).
      const etiquetas = serial ? [etiquetaPorSerial(todas, serial)].filter(Boolean) : todas
      if (!etiquetas.length) {
        toast.error('Sin etiquetas', serial ? 'No se encontró la etiqueta de esa unidad.' : 'La compra no tiene unidades para etiquetar.')
        return
      }
      const { ancho } = configImpresora()
      const contexto = { ancho, compra: datos?.compra || null }
      const resultado = await imprimirDocumentoNoFiscal(ticketEtiquetasLote(etiquetas, contexto), {
        tipo: 'etiquetas-lote',
        respaldo: async () => printHtml(await buildEtiquetasLoteHtml(etiquetas, contexto)),
      })
      if (resultado?.ok) {
        toast.success(resultado.dialogo ? 'Etiquetas listas' : 'Etiquetas enviadas', `${etiquetas.length} etiqueta(s) de ${compra.code}.`)
        return
      }
      if (!resultado?.dialogo) toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } catch (causa) {
      toast.error('No se pudo imprimir', causa?.message || 'Reintentá en un momento.')
    } finally {
      setEtiquetasBusy('')
    }
  }

  // La compra abierta se sigue mostrando aunque ya no esté en «pendientes»
  // (queda con las líneas completas hasta que la cierren).
  const visibles = useMemo(() => {
    if (!abierta) return compras
    return compras.some((compra) => compra.id === abierta.id) ? compras : [abierta, ...compras]
  }, [compras, abierta])

  const catalogo = useMemo(() => getProductos(), [])

  const lineasPanel = useMemo(() => (abierta?.lines || []).map((fila) => ({
    id: fila.id,
    productId: fila.productId,
    nombre: `${fila.product?.name || 'Producto'}${fila.product?.capacity ? ` · ${fila.product.capacity}` : ''}`,
    cantidad: Number(fila.quantity) || 0,
    seriales: (fila.serials || []).map((item) => (typeof item === 'string' ? { serial: item } : item)),
  })), [abierta])

  async function agregarSerial(serial, { luhnForzado, lineId }) {
    const datos = await resources.supplyPurchases.update({ id: abierta.id, action: 'scan', lineId, serial, ...(luhnForzado ? { forzarLuhn: true } : {}) })
    if (datos?.aviso) toast.info('Aviso del proveedor', datos.aviso)
    setUltimoSerial(serial)
    await cargar()
    return datos
  }

  async function agregarVarios(seriales, lineId) {
    await resources.supplyPurchases.update({ id: abierta.id, action: 'serials', lineId, serials: seriales })
    await cargar()
  }

  async function quitarSerial(serial, lineId) {
    await resources.supplyPurchases.update({ id: abierta.id, action: 'removeSerial', lineId, serial })
    await cargar()
  }

  return (
    <div className="compras-flujo gp ventas-f3 space-y-4" data-testid="preparar-compra">
      <EncabezadoFlujo
        className="min-w-0 w-full"
        paso="preparacion"
        onIr={(paso) => navigate(paso.ruta)}
        accion={(
          <Button type="button" variant="outline" data-testid="flujo-actualizar" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
          </Button>
        )}
      />
      {totales && (
        <StatGrid testId="preparar-compra-resumen" etiqueta="Resumen de preparación">
          <Stat compact label="Compras" valor={`${totales.compras} compra${totales.compras === 1 ? '' : 's'}`} />
          <Stat compact label="Pendientes" valor={`${totales.pendientes} IMEI pendiente${totales.pendientes === 1 ? '' : 's'}`} valorClassName={totales.pendientes > 0 ? 'text-warn' : ''} />
        </StatGrid>
      )}

      {filtroCompra && (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="preparar-compra-filtro">
          <Badge color="blue">Compra {filtroCompra}</Badge>
          <button type="button" className="min-h-11 underline" onClick={() => setParams({}, { replace: true })}>Ver todas las compras</button>
        </p>
      )}
      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !compras.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !compras.length ? (
        <EmptyState icon="box" title={filtroCompra ? `No se encontró la compra ${filtroCompra}.` : 'No hay compras por preparar.'} description={filtroCompra ? 'Puede estar cancelada o ser de otra empresa.' : 'Cuando una compra tenga IMEI pendientes, aparece acá.'} />
      ) : (
        <div className="gp-lista-cards space-y-2.5">
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant={expandida ? 'outline' : 'primary'} onClick={() => { setAbierta(expandida ? null : compra); setLineaId(''); setUltimoSerial('') }}>
                    {expandida ? 'Cerrar' : 'Preparar IMEI'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEtiquetasDe(compra)} data-testid="preparar-etiquetas">
                    <Icon name="tag" className="h-3.5 w-3.5" />Etiquetas
                  </Button>
                </div>

                {expandida && (
                  <div className="mt-3 space-y-3 border-t border-ink-600 pt-3">
                    <PanelEscaneoSeriales
                      idBase="preparar-compra"
                      lineas={lineasPanel}
                      lineaId={lineaId}
                      onLinea={setLineaId}
                      productos={catalogo}
                      agregar={agregarSerial}
                      agregarVarios={agregarVarios}
                      quitar={compra.status === 'RECIBIDA' || compra.status === 'CANCELADA' ? null : quitarSerial}
                    />
                    {ultimoSerial && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                        <span>Última unidad escaneada: <b className="text-fore">{ultimoSerial}</b></span>
                        <Button type="button" variant="outline" className="min-h-11" disabled={Boolean(etiquetasBusy)} onClick={() => imprimirEtiquetas(compra, { serial: ultimoSerial })} data-testid="preparar-etiqueta-individual">
                          <Icon name="printer" className="h-3.5 w-3.5" />Etiqueta de esa unidad
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <EtiquetasPreparacion open={Boolean(etiquetasDe)} compra={etiquetasDe} onClose={() => setEtiquetasDe(null)} />
    </div>
  )
}
