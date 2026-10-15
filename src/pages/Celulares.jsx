import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCelulares, rankCelular, getProductos } from '@/lib/storage'
import { useLive } from '@/hooks/useLive'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { cotizacionFx } from '@/lib/fx'
import { EMPRESA_DEMO } from '@/lib/demo/empresa'
import { getPoliticasImpresion } from '@/lib/politicasEmpresa'
import { datosListaPrecios } from '@/lib/printing/listaPrecios'
import { useStockDisplay } from '@/hooks/useStockDisplay'
import { Button, Card, MoneyInput, useResultado } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import BarraModulo from '@/components/shared/BarraModulo'
import SegmentosToolbar from '@/components/app/SegmentosToolbar'
import VistaPreviaPapel from '@/components/shared/VistaPreviaPapel'
import CompartirImagen from '@/components/shared/CompartirImagen'
import CompartirPdf from '@/components/shared/CompartirPdf'
import { buildListaPreciosHtml } from '@/components/shared/OrderReceipt'
import { printHtml } from '@/utils/printHtml'

// Lista por modelo (#448): el papel que la tienda comparte con sus clientes por
// WhatsApp. Lleva la marca de la tienda (logo y nombre; MobOS solo como pie
// chiquito), el estilo del comprobante premium (#407), modelos en dos columnas,
// garantía de las políticas (#443), vigencia, WhatsApp, dirección y QR; precio
// opcional en US$ y marca de «últimas unidades / sin stock». Se comparte como
// imagen (PNG), PDF o se imprime: la misma pieza que muestra la vista previa.

// Demo: sin políticas publicadas (#443) la lista muestra una garantía de ejemplo.
const GARANTIA_DEMO = 'Equipos nuevos: 12 meses de garantía de fábrica.\nSemi nuevos: 3 meses de garantía de la tienda.'

function Opcion({ activa, onCambiar, children, testId }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-ink-600 px-3 text-xs font-semibold lg:min-h-9">
      <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" checked={activa} onChange={(evento) => onCambiar(evento.target.checked)} data-testid={testId} />
      {children}
    </label>
  )
}

export default function Celulares() {
  useLive()
  const navigate = useNavigate()
  const { esDemo, empresa } = useSesion()
  const avisar = useResultado()
  const { colores } = useStockDisplay()
  const [mostrarStock, setMostrarStock] = useState(true)
  const [usd, setUsd] = useState(false)
  const [cotizacion, setCotizacion] = useState('')
  const [tienda, setTienda] = useState(() => ({ nombre: empresa?.nombre || '', direccion: '', telefono: '' }))
  const [garantia, setGarantia] = useState('')
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)

  const celulares = listCelulares()
  const productos = getProductos()

  // Datos de la tienda: la demo usa su empresa ficticia; una cuenta real, su perfil de negocio.
  useEffect(() => {
    let vivo = true
    if (esDemo) {
      setTienda({ nombre: EMPRESA_DEMO.nombreFantasia, direccion: EMPRESA_DEMO.direccion, telefono: EMPRESA_DEMO.telefono })
      return undefined
    }
    api.get('/api/account')
      .then((cuenta) => {
        if (!vivo) return
        const t = cuenta?.tenant || {}
        setTienda({ nombre: t.name || empresa?.nombre || '', direccion: [t.address, t.city].filter(Boolean).join(', '), telefono: t.phone || '' })
      })
      .catch((causa) => console.error('[lista-precios] no se pudo leer el perfil de la tienda', causa))
    return () => { vivo = false }
  }, [esDemo, empresa?.nombre])

  // Garantía de las políticas publicadas (#443): nunca bloquea la lista.
  useEffect(() => {
    let vivo = true
    getPoliticasImpresion().then((politicas) => { if (vivo) setGarantia(politicas?.garantia || (esDemo ? GARANTIA_DEMO : '')) }).catch(() => {})
    return () => { vivo = false }
  }, [esDemo])

  // Cotización del día cuando se pide el precio en dólares; siempre editable a mano.
  useEffect(() => {
    if (!usd || Number(cotizacion) > 0) return undefined
    let vivo = true
    cotizacionFx({ purpose: 'sales' }).then((info) => { if (vivo && info?.rate) setCotizacion(String(Math.round(info.rate))) }).catch(() => {})
    return () => { vivo = false }
  }, [usd, cotizacion])

  const datos = useMemo(() => datosListaPrecios({
    celulares,
    productos,
    tienda,
    garantia,
    cotizacion: usd ? Number(cotizacion) || 0 : 0,
    mostrarStock,
    rankModelo: rankCelular,
  }), [celulares, productos, tienda, garantia, usd, cotizacion, mostrarStock])

  const coloresLista = useMemo(() => ({ nuevo: colores?.colores?.['*']?.nuevo || '', semi: colores?.colores?.['*']?.semi || '' }), [colores])

  useEffect(() => {
    if (!datos.filas) { setHtml(''); return undefined }
    let vivo = true
    setCargando(true)
    buildListaPreciosHtml(datos, { format: 'a4', colores: coloresLista, usd: usd && Boolean(Number(cotizacion)) })
      .then((construido) => { if (vivo) setHtml(construido) })
      .catch((causa) => console.error('[lista-precios] no se pudo armar la lista', causa))
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [datos, coloresLista, usd, cotizacion])

  async function imprimir() {
    if (!html) return
    try {
      await printHtml(html)
    } catch (causa) {
      avisar.fallo('imprimir', causa?.message || 'Revisá la impresora.')
    }
  }

  const nombreArchivo = 'lista-de-precios'
  return (
    <div className="space-y-3">
      {/* #278 · composición compacta (#256): la identidad y las acciones viven en la barra. */}
      <BarraModulo titulo="Lista por modelo" testId="barra-celulares" segmentos={<SegmentosToolbar />}>
        <CompartirImagen construirHtml={() => html} nombre={nombreArchivo} titulo={`Lista de precios · ${tienda.nombre}`} texto="Lista de precios" disabled={!html || cargando} />
        <CompartirPdf construirHtml={() => html} nombre={nombreArchivo} titulo={`Lista de precios · ${tienda.nombre}`} texto="Lista de precios" disabled={!html || cargando} />
        <Button type="button" variant="outline" onClick={imprimir} disabled={!html || cargando}>
          <Icon name="printer" className="h-4 w-4" />Imprimir
        </Button>
      </BarraModulo>

      {!datos.filas ? (
        <Card className="py-10 text-center text-mute">
          <p className="text-sm">
            Todavía no hay precios cargados.
            <br />
            Cargalos en el Centro de Control Celulares y aparecen acá.
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => navigate('/centro-control')}>Abrir Centro de Control</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-testid="lista-precios-opciones">
            <Opcion activa={mostrarStock} onCambiar={setMostrarStock} testId="lista-opcion-stock">Marcar últimas unidades y sin stock</Opcion>
            <Opcion activa={usd} onCambiar={setUsd} testId="lista-opcion-usd">Mostrar también en US$</Opcion>
            {usd ? (
              <label className="inline-flex items-center gap-2 text-xs text-mute">
                Gs por US$
                <MoneyInput aria-label="Cotización del dólar para la lista" value={cotizacion} onValueChange={(valor) => setCotizacion(valor === '' ? '' : String(valor))} className="w-28" />
              </label>
            ) : null}
            <span className="ml-auto text-xs text-mute">{datos.filas} {datos.filas === 1 ? 'precio' : 'precios'} · {datos.vigencia.replace(/, sujetos.*/, '')}</span>
          </div>
          <div data-testid="lista-precios-vista">
            <VistaPreviaPapel formato="a4" contenido={html} titulo="Vista previa de la lista de precios" />
          </div>
        </>
      )}
    </div>
  )
}
