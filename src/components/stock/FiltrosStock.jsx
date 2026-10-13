// Filtros de la lista de Stock (U3): chips de tipo y estado y selectores de
// sucursal y proveedor. El estado vive en la URL (ver stockFiltros.js); este
// componente solo dibuja y avisa el cambio con `onCambio({ clave: valor })`.
import { Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { ESTADOS_STOCK, TIPOS_STOCK } from '@/lib/stockItems'
import { hayFiltrosStock } from './stockFiltros'

function Chips({ etiqueta, valor, opciones, onElegir, testId }) {
  return (
    <div role="group" aria-label={etiqueta} data-testid={testId} className="flex flex-wrap items-center gap-1.5">
      <span className={ROTULO_DATO}>{etiqueta}</span>
      {[['', 'Todos'], ...opciones].map(([id, texto]) => {
        const activo = valor === id
        return (
          <button
            key={id || 'todos'}
            type="button"
            aria-pressed={activo}
            data-testid={`filtro-${testId}-${id || 'todos'}`}
            onClick={() => onElegir(id)}
            className={cn(
              'min-h-11 rounded-full border px-3 text-xs font-semibold transition',
              activo ? 'border-fono bg-fono text-onbrand' : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore',
            )}
          >
            {texto}
          </button>
        )
      })}
    </div>
  )
}

export default function FiltrosStock({
  filtros,
  vista = 'unidades',
  sucursales = [],
  proveedores = [],
  verProveedor = false,
  onCambio,
  onLimpiar,
}) {
  const estadoFijo = vista === 'vendidos' || vista === 'eliminados'
  return (
    <div data-testid="filtros-stock" className="space-y-2">
      <Chips etiqueta="Tipo" testId="tipo" valor={filtros.tipo} opciones={TIPOS_STOCK} onElegir={(tipo) => onCambio({ tipo })} />
      {!estadoFijo ? (
        <Chips etiqueta="Estado" testId="estado" valor={filtros.estado} opciones={ESTADOS_STOCK.map(([id, texto]) => [id, texto])} onElegir={(estado) => onCambio({ estado })} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Sucursal"
          data-testid="filtro-sucursal"
          value={filtros.sucursal}
          onChange={(event) => onCambio({ sucursal: event.target.value })}
          className="min-h-11 w-auto min-w-0 max-w-full"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.name || sucursal.nombre}</option>)}
        </Select>
        {verProveedor ? (
          <Select
            aria-label="Proveedor"
            data-testid="filtro-proveedor"
            value={filtros.proveedor}
            onChange={(event) => onCambio({ proveedor: event.target.value })}
            className="min-h-11 w-auto min-w-0 max-w-full"
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.name || proveedor.nombre}</option>)}
          </Select>
        ) : null}
        {vista === 'vendidos' ? (
          <>
            <Select
              aria-label="Período de vendidos"
              data-testid="filtro-periodo"
              value={filtros.periodo}
              onChange={(event) => onCambio({ periodo: event.target.value, ...(event.target.value === 'rango' ? {} : { desde: '', hasta: '' }) })}
              className="min-h-11 w-auto"
            >
              <option value="">Todos</option>
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="rango">Rango</option>
            </Select>
            {filtros.periodo === 'rango' ? (
              <>
                <Input type="date" aria-label="Desde" value={filtros.desde} onChange={(event) => onCambio({ desde: event.target.value })} className="min-h-11 w-auto" />
                <Input type="date" aria-label="Hasta" value={filtros.hasta} onChange={(event) => onCambio({ hasta: event.target.value })} className="min-h-11 w-auto" />
              </>
            ) : null}
          </>
        ) : null}
        {hayFiltrosStock(filtros) || filtros.periodo ? (
          <button
            type="button"
            data-testid="filtros-limpiar"
            onClick={onLimpiar}
            className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fono-light transition hover:underline"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>
    </div>
  )
}
