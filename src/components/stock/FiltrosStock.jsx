// Filtros de la lista de Stock (U3): chips de tipo y estado y selectores de
// sucursal y proveedor. El estado vive en la URL (ver stockFiltros.js); este
// componente solo dibuja y avisa el cambio con `onCambio({ clave: valor })`.
import { useState } from 'react'
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
  compacto = false,
}) {
  const [abierto, setAbierto] = useState(false)
  const estadoFijo = vista === 'vendidos' || vista === 'eliminados'
  // Vendidos conserva el período a la vista: en el resto, sucursal y proveedor
  // pasan a un panel que se abre con «Más».
  const colapsa = compacto && vista !== 'vendidos'
  const limpiar = hayFiltrosStock(filtros) || filtros.periodo ? (
    <button
      type="button"
      data-testid="filtros-limpiar"
      onClick={onLimpiar}
      className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-fono-light transition hover:underline"
    >
      Limpiar filtros
    </button>
  ) : null
  const selectores = (
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
        {!colapsa ? limpiar : null}
      </div>
  )
  const hayPuestos = ['sucursal', 'proveedor', 'periodo'].some((clave) => Boolean(filtros[clave]))
  if (compacto) {
    // Móvil (#304): Tipo y Estado en una sola fila de selectores para que la
    // primera tarjeta entre en el primer viewport. Con algún filtro puesto el
    // panel de sucursal y proveedor queda abierto junto a «Limpiar filtros».
    const panel = colapsa ? (abierto || hayFiltrosStock(filtros) || hayPuestos) : true
    return (
      <div data-testid="filtros-stock" className="space-y-1">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Tipo"
            data-testid="filtro-tipo-select"
            value={filtros.tipo}
            onChange={(event) => onCambio({ tipo: event.target.value })}
            className="min-h-11 min-w-0 flex-1"
          >
            <option value="">Tipo</option>
            {TIPOS_STOCK.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
          </Select>
          {!estadoFijo ? (
            <Select
              aria-label="Estado"
              data-testid="filtro-estado-select"
              value={filtros.estado}
              onChange={(event) => onCambio({ estado: event.target.value })}
              className="min-h-11 min-w-0 flex-1"
            >
              <option value="">Estado</option>
              {ESTADOS_STOCK.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
            </Select>
          ) : null}
          {colapsa ? (
            <button
              type="button"
              data-testid="filtros-mas"
              aria-expanded={panel}
              aria-controls="filtros-stock-panel"
              onClick={() => setAbierto((actual) => !actual)}
              className="min-h-11 shrink-0 rounded-lg border border-ink-600 px-3 text-xs font-semibold text-mute transition hover:text-fore"
            >
              Más{hayPuestos ? ' ·' : ''}
            </button>
          ) : null}
        </div>
        {panel ? <div id="filtros-stock-panel">{selectores}{colapsa ? limpiar : null}</div> : null}
      </div>
    )
  }
  return (
    <div data-testid="filtros-stock" className="space-y-2">
      <Chips etiqueta="Tipo" testId="tipo" valor={filtros.tipo} opciones={TIPOS_STOCK} onElegir={(tipo) => onCambio({ tipo })} />
      {!estadoFijo ? (
        <Chips etiqueta="Estado" testId="estado" valor={filtros.estado} opciones={ESTADOS_STOCK.map(([id, texto]) => [id, texto])} onElegir={(estado) => onCambio({ estado })} />
      ) : null}
      {selectores}
    </div>
  )
}
