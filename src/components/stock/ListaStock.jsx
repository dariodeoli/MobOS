// Lista unificada de Stock (U3): unidades por IMEI y accesorios por SKU en una
// sola lista paginada por cursor (GET /api/stock/items). La misma lista sirve
// a Unidades, Vendidos y Eliminados: cambia el estado fijo y las columnas extra.
//
// - Escritorio: grilla compartida entre encabezado y filas (docs/TABLAS.md).
// - Móvil (<768 px): tarjetas con modelo, IMEI, batería y estado; proveedor y
//   costo en un detalle plegado.
import './stockLista.css'
import { Aviso, Button, EmptyState, Skeleton } from '@/components/ui'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { columnaCostoVisible, textoMostrandoStock, unidadDeItem } from '@/lib/stockItems'
import { cn } from '@/lib/utils'
import { CELDA_ENCABEZADO } from '@/components/shared/tabla'
import { accionesDeItem } from './AccionesUnidad'
import FiltrosStock from './FiltrosStock'
import { FilaStock, columnasStock, estiloColumnas } from './FilaStock'
import { TarjetaStockMovil } from './TarjetaStockMovil'
import { hayFiltrosStock } from './stockFiltros'

const VACIO = {
  unidades: 'No hay stock con esos filtros todavía.',
  vendidos: 'Todavía no hay vendidos en el período.',
  eliminados: 'No hay unidades eliminadas recuperables.',
}

function EncabezadoStock({ verCosto, vista, todosMarcados, onMarcarTodos, hayFilas }) {
  return (
    <div
      data-testid="inventario-encabezado"
      className="stock-lista-grid stock-lista-encabezado rounded-lg border border-transparent border-b-ink-600/60 bg-ink-800/40 px-2 py-1"
    >
      <span className="flex items-center">
        <label className="flex h-11 w-11 items-center justify-center">
          <input
            type="checkbox"
            className="h-4 min-h-0 w-4 accent-fono"
            aria-label="Seleccionar visibles"
            title="Seleccionar visibles"
            disabled={!hayFilas}
            checked={todosMarcados}
            onChange={onMarcarTodos}
          />
        </label>
      </span>
      <span className={CELDA_ENCABEZADO}>Modelo</span>
      <span className={CELDA_ENCABEZADO} title="IMEI de la unidad o SKU del accesorio">IMEI / serie</span>
      <span className={CELDA_ENCABEZADO}>Batería</span>
      {verCosto ? <span className={cn(CELDA_ENCABEZADO, 'stock-lista-prov')}>Proveedor</span> : null}
      {verCosto ? <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Costo</span> : null}
      <span className={cn(CELDA_ENCABEZADO, 'pl-1')}>Estado</span>
      {vista === 'vendidos' ? <span className={CELDA_ENCABEZADO}>Vendido</span> : null}
      {vista === 'eliminados' ? <span className={CELDA_ENCABEZADO}>Nota</span> : null}
      <span aria-hidden="false"><span className="sr-only">Acciones</span></span>
    </div>
  )
}

function FilasCargandoStock({ columnas, angosta }) {
  return (
    <div className="space-y-1" data-testid="unidades-cargando" aria-busy="true" aria-label="Cargando stock">
      {Array.from({ length: 5 }).map((_, indice) => (
        angosta
          ? <Skeleton key={indice} className="h-24 w-full rounded-xl" />
          : (
            <div key={indice} className="stock-lista-grid rounded-lg border border-ink-600 px-2 py-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-10" />
              {columnas.completa.split(' ').slice(4).map((_, extra) => <Skeleton key={extra} className="h-3 w-16" />)}
            </div>
          )
      ))}
    </div>
  )
}

export default function ListaStock({ ctx, vista = 'unidades' }) {
  const {
    stock, filtros, cambiarFiltros, limpiarFiltros, seleccionados, setSeleccionados, busy, products,
    branches, proveedores, rolVeCosto, abrirDetalleItem, requestReason, navigate, query,
  } = ctx
  const angosta = usePantallaAngosta('(min-width: 768px)')
  const items = stock.items
  const verCosto = columnaCostoVisible({ rolVeCosto, items })
  const columnas = columnasStock({ verCosto, vista })
  const abrir = (item) => {
    if (item.kind === 'product') navigate(`/productos?producto=${encodeURIComponent(item.productId)}`)
    else abrirDetalleItem(item)
  }
  const propsFila = (item) => ({
    item,
    vista,
    verCosto,
    busy,
    seleccionado: seleccionados.includes(item.id),
    onAlternar: () => setSeleccionados((actuales) => alternarId(actuales, item.id)),
    onAbrir: () => abrir(item),
    acciones: accionesDeItem(item, ctx),
    onRestaurar: item.status === 'eliminado' && item.kind === 'unit' ? () => requestReason('restore', unidadDeItem(item, products)) : undefined,
  })
  const filtrado = Boolean(query) || hayFiltrosStock(filtros) || Boolean(filtros.periodo)
  const todosMarcados = items.length > 0 && items.every((item) => seleccionados.includes(item.id))

  return (
    <div className="stock-lista mt-2 space-y-2 md:mt-4 md:space-y-3" data-testid="inventario-lista" data-vista={vista}>
      <FiltrosStock
        filtros={filtros}
        vista={vista}
        sucursales={branches}
        proveedores={proveedores}
        verProveedor={rolVeCosto}
        onCambio={cambiarFiltros}
        onLimpiar={limpiarFiltros}
        compacto={angosta}
      />
      {stock.error ? (
        <Aviso tono="error" data-testid="stock-error">
          {stock.error}{' '}
          <button type="button" className="min-h-11 font-semibold underline" onClick={stock.recargar}>Reintentar</button>
        </Aviso>
      ) : null}
      {stock.cargando ? (
        <div data-testid={angosta ? 'inventario-tarjetas' : 'inventario-tabla'} style={estiloColumnas(columnas)}>
          {!angosta ? <EncabezadoStock verCosto={verCosto} vista={vista} hayFilas={false} todosMarcados={false} onMarcarTodos={() => {}} /> : null}
          <FilasCargandoStock columnas={columnas} angosta={angosta} />
        </div>
      ) : !items.length ? (
        <div data-testid="unidades-vacio">
          <EmptyState compact icon="box" title={filtrado ? 'Ningún artículo coincide con la búsqueda o los filtros.' : VACIO[vista]} />
        </div>
      ) : angosta ? (
        <div className="space-y-1.5" data-testid="inventario-tarjetas">
          {items.map((item) => <TarjetaStockMovil key={item.id} {...propsFila(item)} />)}
        </div>
      ) : (
        <div data-testid="inventario-tabla" className="overflow-x-clip" style={estiloColumnas(columnas)}>
          <EncabezadoStock
            verCosto={verCosto}
            vista={vista}
            hayFilas
            todosMarcados={todosMarcados}
            onMarcarTodos={() => setSeleccionados((actuales) => seleccionarTodos(items, actuales))}
          />
          <div className="space-y-1" aria-busy="false">
            {items.map((item) => <FilaStock key={item.id} {...propsFila(item)} />)}
          </div>
        </div>
      )}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="pie-listado">
          <p className="text-xs text-mute" role="status" data-testid="stock-mostrando">{textoMostrandoStock(items.length, stock.total)}</p>
          {stock.hasMore ? (
            <Button type="button" variant="outline" className="min-h-11 px-4 text-xs" disabled={stock.cargandoMas} onClick={stock.cargarMas}>
              {stock.cargandoMas ? 'Cargando…' : 'Cargar más'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
