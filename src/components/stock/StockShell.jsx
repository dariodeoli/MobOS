import './stockF4.css'
import './stockToque.css'
import './stockRediseno.css'
import { useEffect, useMemo, useRef } from 'react'
import { Aviso, Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import { claveBadge, publicarBadgePestana } from '@/lib/badgesPestanas'
import BarraLote from '@/components/shared/BarraLote'
import { seccionDeTab, seccionesDeStock } from './stockHelpers'
import { useStockControl } from './useStockControl'
import AccionesUnidad from './AccionesUnidad'
import EtiquetasStockPlantilla from './EtiquetasStockPlantilla'
import BarraStock from './BarraStock'
import TabTaller from './TabTaller'
import TabAutorizaciones from './TabAutorizaciones'
import ListaStock from './ListaStock'
import TabTransito from './TabTransito'
import TabAlertas from './TabAlertas'
import TabReservas from './TabReservas'
import TabTraslados from './TabTraslados'
import TabUbicaciones from './TabUbicaciones'
import TabCompartido from './TabCompartido'
import TabConteos from './TabConteos'
import TabVerificacion from './TabVerificacion'

export default function StockShell({ tab: tabProp, onTabChange } = {}) {
  const ctx = useStockControl({ tab: tabProp, onTabChange })
  const { inventarioOperativo, setReserveOpen, tab, busy, cambiarTab, cambiarFiltros, limpiarFiltros, grupos, notice, error, seleccionados, setSeleccionados, venderTodos, unidadesElegidas, verify, setReserve, requestReason, copiarImeis, exportarUnidadesSeleccionadas, imprimirEtiquetasSeleccion } = ctx
  // #357: el contador de autorizaciones pendientes también se ve en la pestaña
  // «Control» del shell; se retira al salir de Stock para no dejar uno viejo.
  const pendientesStock = ctx.pendientesStock
  useEffect(() => {
    const clave = claveBadge('stock', 'control')
    publicarBadgePestana(clave, pendientesStock)
    return () => publicarBadgePestana(clave, 0)
  }, [pendientesStock])
  const secciones = useMemo(() => seccionesDeStock(grupos || []), [grupos])
  const grupoActivo = seccionDeTab(secciones, tab) || { id: 'unidades', label: 'Unidades', tabs: ['unidades'] }
  // «Vendidos» y «Eliminados» son opciones del chip Estado: cambian de vista. Si se
  // vuelve a un estado normal desde ellas, el filtro se aplica al abrir Unidades.
  const estadoPendiente = useRef(null)
  const elegirEstado = (id) => {
    if (id === 'vendidos' || id === 'eliminados') { if (tab !== id) cambiarTab(id); return }
    if (tab !== 'unidades') { estadoPendiente.current = id; cambiarTab('unidades'); return }
    cambiarFiltros({ estado: id })
  }
  useEffect(() => {
    if (tab !== 'unidades' || estadoPendiente.current === null) return
    cambiarFiltros({ estado: estadoPendiente.current })
    estadoPendiente.current = null
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const limpiarFiltrosEstado = () => { limpiarFiltros(); if (tab !== 'unidades') cambiarTab('unidades') }
  if (!inventarioOperativo) return <Card><h2 className="font-bold">Inventario operativo</h2><p className="mt-2 text-sm text-mute">Ingresá con una cuenta real para controlar IMEI, reservas, ubicaciones y transferencias. La demo conserva sus datos aislados.</p></Card>
  return <div className={cn('stock-rediseno space-y-3 max-sm:space-y-2', temaV2Activo() && 'tema-v2')}>
      {/* Una sola barra por pestaña del shell (Unidades · Traslados · Control): sin
          segunda fila de pestañas ni caja extra antes de la lista. */}
      {!(tab === 'conteos' && ctx.conteoId) && <BarraStock ctx={ctx} grupo={grupoActivo} elegirEstado={elegirEstado} limpiar={limpiarFiltrosEstado} />}
      {notice && <Aviso tono="ok">{notice}</Aviso>}{error && <Aviso tono="error">{error}</Aviso>}
    <BarraLote cantidad={seleccionados.length} onLimpiar={() => setSeleccionados([])}>
      <button type="button" disabled={busy} data-testid="vender-todos" title="Cargar la venta de todas las seleccionadas en el POS" onClick={venderTodos} className="min-h-11 rounded-lg border border-fono/50 bg-fono/10 px-2 py-1 text-xs md:min-h-0 font-semibold text-fono-light transition hover:bg-fono/20 disabled:opacity-50">Vender todos</button>
      <button type="button" disabled={busy} title="Registrar la verificación física de todas las seleccionadas" onClick={() => Promise.all(unidadesElegidas().map(unidad => verify(unidad)))} className="min-h-11 rounded-lg border border-ok/40 px-2 py-1 text-xs md:min-h-0 font-semibold text-ok transition hover:bg-ok/10 disabled:opacity-50">Verificar todos</button>
      <button type="button" disabled={busy} title="Apartar todas las seleccionadas para un cliente" onClick={() => { setReserve(data => ({ ...data, serials: unidadesElegidas().map(unidad => unidad.serial).join(', ') })); setReserveOpen(true) }} className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs md:min-h-0 font-semibold transition hover:text-fore disabled:opacity-50">Reservar todos</button>
      <button type="button" disabled={busy} title="Marcar en revisión con un motivo (queda auditado)" onClick={() => requestReason('adjust', unidadesElegidas())} className="min-h-11 rounded-lg border border-warn/40 px-2 py-1 text-xs md:min-h-0 font-semibold text-warn transition hover:bg-warn/10 disabled:opacity-50">Enviar a revisión</button>
      <button type="button" disabled={busy} title="Dar de baja con un motivo (quedan en Eliminados)" onClick={() => requestReason('remove', unidadesElegidas())} className="min-h-11 rounded-lg border border-bad/40 px-2 py-1 text-xs md:min-h-0 font-semibold text-bad transition hover:bg-bad/10 disabled:opacity-50">Dar de baja</button>
      <button type="button" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore md:min-h-0" onClick={copiarImeis}>Copiar IMEIs</button>
      <button type="button" disabled={busy} data-testid="imprimir-etiquetas" title="Imprimir las etiquetas de las filas seleccionadas" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore disabled:opacity-50" onClick={() => imprimirEtiquetasSeleccion()}>Imprimir etiquetas</button>
      <button type="button" disabled={busy} data-testid="etiquetas-vista-previa" title="Ver cómo quedan las etiquetas antes de imprimir" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore disabled:opacity-50" onClick={() => imprimirEtiquetasSeleccion(undefined, { vistaPrevia: true })}>Vista previa</button>
      <button type="button" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore md:min-h-0" onClick={exportarUnidadesSeleccionadas}>Exportar CSV</button>
    </BarraLote>
    
    <div className="stock-toque space-y-3">
      {tab === 'taller' && <TabTaller ctx={ctx} />}
      {tab === 'autorizaciones' && <TabAutorizaciones ctx={ctx} />}
      {tab === 'unidades' && <ListaStock ctx={ctx} vista="unidades" />}
      {tab === 'vendidos' && <ListaStock ctx={ctx} vista="vendidos" />}
      {tab === 'transito' && <TabTransito ctx={ctx} />}
      {tab === 'alertas' && <TabAlertas ctx={ctx} />}
      {tab === 'reservas' && <TabReservas ctx={ctx} />}
      {tab === 'traslados' && <TabTraslados ctx={ctx} />}
      {tab === 'ubicaciones' && <TabUbicaciones ctx={ctx} />}
      {tab === 'compartido' && <TabCompartido ctx={ctx} />}
      {tab === 'eliminados' && <ListaStock ctx={ctx} vista="eliminados" />}
      {tab === 'conteos' && <TabConteos ctx={ctx} />}
      {tab === 'verificacion' && <TabVerificacion ctx={ctx} />}
    </div>
      {ctx.etiquetasPlantilla && <EtiquetasStockPlantilla key={ctx.etiquetasPlantilla.scope} filas={ctx.etiquetasPlantilla.filas} onClose={() => ctx.setEtiquetasPlantilla(null)} onHabitual={() => {
        const selection = ctx.etiquetasPlantilla
        ctx.setEtiquetasPlantilla(null)
        imprimirEtiquetasSeleccion(selection.items, { habitual: true, vistaPrevia: selection.vistaPrevia })
      }} />}
      <AccionesUnidad ctx={ctx} />
    </div>
}
