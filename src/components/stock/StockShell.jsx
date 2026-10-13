import './stockF4.css'
import { useMemo } from 'react'
import { Aviso, Button, Card, Subtabs } from '@/components/ui'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import BarraModulo from '@/components/shared/BarraModulo'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import VistaProductosUnidades from '@/components/shared/VistaProductosUnidades'
import MenuSecundario from '@/components/shared/MenuSecundario'
import BarraLote from '@/components/shared/BarraLote'
import { TAB_LABEL, seccionDeTab, seccionesDeStock } from './stockHelpers'
import { useStockControl } from './useStockControl'
import AccionesUnidad from './AccionesUnidad'
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

export default function StockShell({ tab: tabProp, onTabChange } = {}) {
  const ctx = useStockControl({ tab: tabProp, onTabChange })
  const { inventarioOperativo, productoFiltro, setSearchParams, search, query, setQuery, esMovil, abrirReceive, setScannerOpen, startCount, setGondolaOpen, setReserveOpen, setTransferOpen, tab, exportando, busy, exportarUnidades, cambiarTab, grupos, pendientesStock, notice, error, seleccionados, setSeleccionados, venderTodos, unidadesElegidas, verify, setReserve, requestReason, copiarImeis, exportarUnidadesSeleccionadas, imprimirEtiquetasSeleccion } = ctx
  const secciones = useMemo(() => seccionesDeStock(grupos || []), [grupos])
  const seccionActiva = seccionDeTab(secciones, tab) || { id: 'unidades', label: 'Unidades', tabs: ['unidades'] }
  // Elegir una sección abre su primera vista (o se queda si ya estás en una de sus vistas).
  const irASeccion = (id) => {
    const destino = secciones.find((seccion) => seccion.id === id)
    if (!destino || destino.tabs.includes(tab)) return
    cambiarTab(destino.tabs[0])
  }
  if (!inventarioOperativo) return <Card><h2 className="font-bold">Inventario operativo</h2><p className="mt-2 text-sm text-mute">Ingresá con una cuenta real para controlar IMEI, reservas, ubicaciones y transferencias. La demo conserva sus datos aislados.</p></Card>
  return <div className={cn('space-y-4', temaV2Activo() && 'tema-v2')}>
      {/* #305: una sola barra antes de la tabla. Identidad + buscador +
          filtros/orden + vista + Recibir + las acciones secundarias en «Más». */}
      <BarraModulo
        icono="box"
        titulo="Stock"
        descripcion="Cada IMEI es una unidad física con sucursal, ubicación, estado y auditoría."
        testId="barra-inventario"
        expandir
        contexto={productoFiltro ? <span data-testid="inventario-filtro-producto" className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-lg border border-fono/30 bg-fono/5 px-2 py-1 text-[11px] text-fono-light" title={`Unidades de ${productoFiltro.nombre}`}><Icon name="phone" className="h-3 w-3 shrink-0" /><span className="truncate font-semibold">{productoFiltro.nombre}</span><button type="button" aria-label="Quitar el filtro de producto" title="Ver todas las unidades" onClick={() => setSearchParams((actuales) => { const params = new URLSearchParams(actuales); params.delete('producto'); return params }, { replace: true })} className="toque-44 shrink-0 rounded px-1 text-mute transition hover:text-fore">×</button></span> : null}
      >
        <form onSubmit={search} className="min-w-[10rem] max-w-sm flex-1">
          <SearchField value={query} onChange={event => setQuery(event.target.value)} placeholder="Escanear IMEI, SKU o buscar modelo" ariaLabel="Buscar en inventario" className="w-full" />
        </form>
        {/* #287: Productos ⇄ Unidades, el mismo objeto en dos vistas.
            #304: en móvil el switch se oculta (el menú ya tiene ambas vistas)
            para que el primer equipo entre en el primer viewport. */}
        {!esMovil && <VistaProductosUnidades vista="unidades" q={query} productoId={productoFiltro?.id || ''} />}
        <Button onClick={abrirReceive}>+ Recibir unidad</Button>
        {/* #305: las acciones secundarias viven en un solo menú. */}
        <MenuSecundario
          direccion="abajo"
          etiqueta="Más"
          ariaLabel="Más acciones de inventario"
          acciones={[
            { icon: 'search', label: 'Escanear', onClick: () => setScannerOpen(true) },
            { icon: 'check', label: 'Conteo rápido', onClick: startCount },
            { icon: 'tag', label: 'Etiquetas de góndola', onClick: () => setGondolaOpen(true) },
            { separador: true },
            { icon: 'clock', label: 'Reservar', onClick: () => setReserveOpen(true) },
            { icon: 'transfer', label: 'Transferir', onClick: () => setTransferOpen(true) },
            ...(tab === 'unidades' ? [{ icon: 'download', label: 'Exportar CSV', disabled: exportando || busy, onClick: exportarUnidades }] : []),
          ]}
        />
      </BarraModulo>

      <Card className="p-4 md:p-4">
        
        {/* U3: Unidades · Reservas · Movimientos · Control. La sección activa se
            deriva de la pestaña, así los enlaces directos (/stock/transito,
            /inventario/transito) siguen abriendo su vista; las vistas de cada
            sección van en una segunda fila. */}
        <div data-testid="grupos-inventario" className="mb-3 space-y-2">
          <div data-testid="tabs-inventario">
            <Subtabs
              ariaLabel="Secciones de stock"
              className="!mb-0 !gap-1 !p-1"
              value={seccionActiva.id}
              onChange={irASeccion}
              items={secciones.map((seccion) => [seccion.id, seccion.label, seccion.id === 'control' && pendientesStock > 0 ? pendientesStock : undefined])}
            />
          </div>
          {seccionActiva.tabs.length > 1 ? (
            <div data-testid="subtabs-inventario">
              <Subtabs
                ariaLabel={`Vistas de ${seccionActiva.label}`}
                className="!mb-0 !gap-1 !border-0 !bg-transparent !p-0"
                value={tab}
                onChange={cambiarTab}
                items={seccionActiva.tabs.map((id) => [id, TAB_LABEL[id], id === 'autorizaciones' && pendientesStock > 0 ? pendientesStock : undefined])}
              />
            </div>
          ) : null}
        </div>{notice && <Aviso tono="ok" className="mt-3">{notice}</Aviso>}{error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
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
      </Card>
      <AccionesUnidad ctx={ctx} />
    </div>
}
