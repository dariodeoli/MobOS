// Barra de herramientas de Stock: UNA fila por pestaña del shell (docs/PANTALLAS.md
// regla 7). Cada pestaña dibuja la suya; nunca la de inventario donde no aplica.
//  - Unidades: búsqueda · filtros · «+ Recibir unidad» · Más.
//  - Traslados: vistas (Traslados · En tránsito) · [búsqueda en tránsito] · «Transferir».
//  - Control: vistas (conteos, alertas, autorizaciones, taller, ubicaciones,
//    compartido, reservas) · acción propia de la vista.
// La descripción de cada pestaña va en un tooltip de ayuda, no como texto fijo.
import { Link } from 'react-router-dom'
import { Subtabs, Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import MenuSecundario from '@/components/shared/MenuSecundario'
import Toolbar from '@/components/shared/Toolbar'
import { cn } from '@/lib/utils'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { TAB_LABEL } from './stockHelpers'
import FiltrosStock from './FiltrosStock'

// Debajo de lg los botones de la barra miden 44 px.
const TOQUE = 'min-h-11 lg:min-h-0'
const AYUDA_UNIDADES = 'Cada IMEI es una unidad física con sucursal, ubicación, estado y auditoría.'
const AYUDA_TRASLADOS = 'Lotes de equipos que viajan entre sucursales, con su ETA, remito y guía.'
const AYUDA_CONTROL = 'Conteos, alertas, autorizaciones, taller, ubicaciones, stock compartido y reservas.'

function Ayuda({ texto }) {
  return (
    <span
      data-testid="barra-ayuda"
      role="img"
      aria-label={texto}
      title={texto}
      className="hidden h-8 w-8 shrink-0 place-items-center text-mute sm:inline-grid"
    >
      <Icon name="info" className="h-4 w-4" />
    </span>
  )
}

function Buscador({ ctx, placeholder, ariaLabel = 'Buscar en inventario' }) {
  return (
    <form onSubmit={ctx.search} className="w-full">
      <SearchField value={ctx.query} onChange={(event) => ctx.setQuery(event.target.value)} placeholder={placeholder} ariaLabel={ariaLabel} className="w-full" />
    </form>
  )
}

function ContextoProducto({ ctx }) {
  const { productoFiltro, setSearchParams } = ctx
  if (!productoFiltro) return null
  return (
    <span data-testid="inventario-filtro-producto" className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-lg border border-fono/30 bg-fono/5 px-2 py-1 text-[11px] text-fono-light" title={`Unidades de ${productoFiltro.nombre}`}>
      <Icon name="phone" className="h-3 w-3 shrink-0" />
      <span className="truncate font-semibold">{productoFiltro.nombre}</span>
      <Link to={`/productos?${new URLSearchParams({ ...(ctx.query ? { q: ctx.query } : {}), producto: productoFiltro.id }).toString()}`} title="Ver este producto en Productos, con la búsqueda puesta" className="shrink-0 font-semibold underline">Ver en Productos</Link>
      <button type="button" aria-label="Quitar el filtro de producto" title="Ver todas las unidades" onClick={() => setSearchParams((actuales) => { const params = new URLSearchParams(actuales); params.delete('producto'); return params }, { replace: true })} className="toque-44 shrink-0 rounded px-1 text-mute transition hover:text-fore">×</button>
    </span>
  )
}

function BarraUnidades({ ctx, elegirEstado, limpiar }) {
  const angosta = usePantallaAngosta('(min-width: 1024px)')
  const { tab, filtros, cambiarFiltros, branches, proveedores, rolVeCosto, abrirReceive, setScannerOpen, startCount, setGondolaOpen, setReserveOpen, setTransferOpen, exportando, busy, exportarUnidades, orden, recordarOrden } = ctx
  return (
    <Toolbar
      plano
      testId="barra-inventario"
      className="max-sm:flex-nowrap max-sm:gap-x-2"
      label="Acciones de Stock"
      searchClassName="max-sm:flex-1 max-sm:basis-0 sm:min-w-[19rem]"
      search={<Buscador ctx={ctx} placeholder={angosta ? 'IMEI o modelo' : 'Escanear IMEI, SKU o buscar modelo'} />}
      filters={(
        <>
          <ContextoProducto ctx={ctx} />
          <FiltrosStock
            filtros={filtros}
            vista={tab}
            sucursales={branches}
            proveedores={proveedores}
            verProveedor={rolVeCosto}
            onCambio={cambiarFiltros}
            onEstado={elegirEstado}
            onLimpiar={limpiar}
            compacto={angosta}
            orden={orden}
            onOrden={recordarOrden}
          />
        </>
      )}
      primary={(
        <Button className={cn(TOQUE, 'max-sm:min-w-11 max-sm:px-0')} onClick={abrirReceive}>
          <span aria-hidden="true" className="text-xl leading-none sm:hidden">+</span>
          <span className="max-sm:sr-only">+ Recibir unidad</span>
        </Button>
      )}
      more={(
        <>
          <Ayuda texto={AYUDA_UNIDADES} />
          <MenuSecundario
            direccion="abajo"
            soloIconoMovil
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
        </>
      )}
    />
  )
}

// Segundo nivel (segmentado): las vistas de la pestaña. Conserva los testids y
// el rol `tab` de las pruebas de navegación (`grupos-inventario`, `subtabs-inventario`).
function Vistas({ grupo, tab, onCambiar, pendientesStock }) {
  if (grupo.tabs.length < 2) return null
  return (
    <div data-testid="grupos-inventario" className="min-w-0 max-w-full">
      <div data-testid="subtabs-inventario" className="min-w-0 max-w-full">
        <Subtabs
          ariaLabel={`Vistas de ${grupo.label}`}
          className="!mb-0 !gap-1 !p-1 max-md:!flex-nowrap max-md:overflow-x-auto max-md:[&>button]:shrink-0 max-md:[&>button]:whitespace-nowrap"
          value={tab}
          onChange={onCambiar}
          items={grupo.tabs.map((id) => [id, TAB_LABEL[id], id === 'autorizaciones' && pendientesStock > 0 ? pendientesStock : undefined])}
        />
      </div>
    </div>
  )
}

function BarraTraslados({ ctx, grupo }) {
  const { tab, cambiarTab, setTransferOpen, pendientesStock } = ctx
  return (
    <Toolbar
      plano
      testId="barra-traslados"
      label="Acciones de traslados"
      view={<Vistas grupo={grupo} tab={tab} onCambiar={cambiarTab} pendientesStock={pendientesStock} />}
      search={tab === 'transito' ? <Buscador ctx={ctx} placeholder="Buscar IMEI, SKU o modelo en tránsito" ariaLabel="Buscar en tránsito" /> : undefined}
      more={<Ayuda texto={AYUDA_TRASLADOS} />}
      primary={<Button className={TOQUE} onClick={() => setTransferOpen(true)}>Transferir unidades</Button>}
    />
  )
}

function BarraControl({ ctx, grupo }) {
  const { tab, cambiarTab, pendientesStock, startCount, setReserveOpen } = ctx
  const primary = tab === 'conteos'
    ? <Button className={TOQUE} onClick={startCount}>Conteo rápido</Button>
    : tab === 'reservas'
      ? <Button className={TOQUE} onClick={() => setReserveOpen(true)}>+ Reservar</Button>
      : undefined
  return (
    <Toolbar
      plano
      testId="barra-control"
      label="Acciones de control de stock"
      view={<Vistas grupo={grupo} tab={tab} onCambiar={cambiarTab} pendientesStock={pendientesStock} />}
      more={<Ayuda texto={AYUDA_CONTROL} />}
      primary={primary}
    />
  )
}

export default function BarraStock({ ctx, grupo, elegirEstado, limpiar }) {
  if (grupo.id === 'traslados') return <BarraTraslados ctx={ctx} grupo={grupo} />
  if (grupo.id === 'control') return <BarraControl ctx={ctx} grupo={grupo} />
  return <BarraUnidades ctx={ctx} elegirEstado={elegirEstado} limpiar={limpiar} />
}
