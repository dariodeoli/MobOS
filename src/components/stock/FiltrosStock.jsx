// Filtros de la lista de Stock (U3, rediseño 2A): viven en la barra de Unidades.
// Escritorio: un chip por filtro (Tipo · Estado · Sucursal · Proveedor) que abre
// su lista de opciones. Celular: un solo botón «Filtros» que abre una hoja con
// los mismos grupos (0 selects nativos antes de la primera unidad). El estado de
// los filtros vive en la URL (ver stockFiltros.js); este componente solo dibuja y
// avisa el cambio con `onCambio({ clave: valor })`.
//
// «Vendidos» y «Eliminados» son opciones de Estado: cambian de vista (pestaña)
// en vez de filtrar, y el chip las muestra como activas.
import { useEffect, useId, useRef, useState } from 'react'
import { Input, Modal, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { ESTADOS_STOCK, TIPOS_STOCK, ordenesStockVisibles } from '@/lib/stockItems'
import { SUCURSAL_TODAS, hayFiltrosStock } from './stockFiltros'

const PERIODOS = [['', 'Todos'], ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['rango', 'Rango']]
// «Vendido» como estado es la vista Vendidos (con su período y fecha de venta).
const OPCIONES_ESTADO = [
  ...ESTADOS_STOCK.filter(([id]) => id !== 'vendido').map(([id, texto]) => [id, texto]),
  ['vendidos', 'Vendidos'],
  ['eliminados', 'Eliminados'],
]
const textoDe = (opciones, valor) => opciones.find(([id]) => id === valor)?.[1] || ''

function Opciones({ etiqueta, testId, valor, opciones, onElegir, vertical = false, textoTodos = 'Todos' }) {
  return (
    <div role="group" aria-label={etiqueta} data-testid={testId} className={cn('flex gap-1.5', vertical ? 'flex-col' : 'flex-wrap items-center')}>
      {[['', textoTodos], ...opciones].map(([id, texto]) => {
        const activo = valor === id
        return (
          <button
            key={id || 'todos'}
            type="button"
            aria-pressed={activo}
            data-testid={`filtro-${testId}-${id || 'todos'}`}
            onClick={() => onElegir(id)}
            className={cn(
              'transition',
              vertical
                ? 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm lg:min-h-9'
                : 'min-h-11 rounded-full border px-3 text-xs font-semibold',
              vertical
                ? (activo ? 'bg-ink-700 font-semibold text-fore' : 'text-mute hover:bg-ink-700 hover:text-fore')
                : (activo ? 'border-fono bg-fono text-onbrand' : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore'),
            )}
          >
            {texto}
          </button>
        )
      })}
    </div>
  )
}

// Chip de escritorio: el valor elegido queda en el rótulo («Estado: Reservado»).
function ChipFiltro({ etiqueta, testId, valorTexto, children }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  const gatillo = useRef(null)
  const idPanel = useId()
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (evento) => { if (raiz.current && !raiz.current.contains(evento.target)) setAbierto(false) }
    const escape = (evento) => {
      if (evento.key !== 'Escape') return
      setAbierto(false)
      gatillo.current?.focus()
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape) }
  }, [abierto])
  const activo = Boolean(valorTexto)
  return (
    <div ref={raiz} className="relative">
      <button
        ref={gatillo}
        type="button"
        data-testid={`filtro-${testId}-abrir`}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((actual) => !actual)}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition lg:min-h-9',
          activo ? 'border-fono bg-fono/10 text-fore' : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore',
        )}
      >
        {etiqueta}{activo ? `: ${valorTexto}` : ''}
        <Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto ? (
        <div id={idPanel} className="absolute left-0 top-full z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border border-ink-600 bg-paper p-1 shadow-xl">
          {typeof children === 'function' ? children(() => setAbierto(false)) : children}
        </div>
      ) : null}
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
  onEstado,
  onLimpiar,
  compacto = false,
  orden = 'recientes',
  onOrden,
}) {
  const [hoja, setHoja] = useState(false)
  const nombreDe = (lista) => lista.map((fila) => [fila.id, fila.name || fila.nombre])
  const opcionesSucursal = nombreDe(sucursales)
  const opcionesProveedor = nombreDe(proveedores)
  // El estado visible es la vista cuando es Vendidos o Eliminados.
  const estado = vista === 'vendidos' || vista === 'eliminados' ? vista : filtros.estado
  const textoEstado = estado ? textoDe(OPCIONES_ESTADO, estado) || textoDe(ESTADOS_STOCK, estado) : ''
  const grupos = [
    { id: 'tipo', etiqueta: 'Tipo', valor: filtros.tipo, opciones: TIPOS_STOCK, texto: textoDe(TIPOS_STOCK, filtros.tipo), elegir: (tipo) => onCambio({ tipo }) },
    { id: 'estado', etiqueta: 'Estado', valor: estado, opciones: OPCIONES_ESTADO, texto: textoEstado, elegir: (siguiente) => onEstado(siguiente) },
    { id: 'sucursal', etiqueta: 'Sucursal', valor: filtros.sucursal, opciones: opcionesSucursal, texto: textoDe(opcionesSucursal, filtros.sucursal), elegir: (sucursal) => onCambio({ sucursal: sucursal || SUCURSAL_TODAS }), textoTodos: 'Todas' },
    ...(verProveedor ? [{ id: 'proveedor', etiqueta: 'Proveedor', valor: filtros.proveedor, opciones: opcionesProveedor, texto: textoDe(opcionesProveedor, filtros.proveedor), elegir: (proveedor) => onCambio({ proveedor }) }] : []),
  ]
  const periodoTexto = vista === 'vendidos' && filtros.periodo ? textoDe(PERIODOS, filtros.periodo) : ''
  const cambiarPeriodo = (periodo) => onCambio({ periodo, ...(periodo === 'rango' ? {} : { desde: '', hasta: '' }) })
  const fechas = filtros.periodo === 'rango' ? (
    <div className="flex flex-wrap items-center gap-2 p-2">
      <Input type="date" aria-label="Desde" value={filtros.desde} onChange={(evento) => onCambio({ desde: evento.target.value })} className="min-h-11 w-full lg:min-h-9" />
      <Input type="date" aria-label="Hasta" value={filtros.hasta} onChange={(evento) => onCambio({ hasta: evento.target.value })} className="min-h-11 w-full lg:min-h-9" />
    </div>
  ) : null
  const hayPuestos = hayFiltrosStock(filtros) || Boolean(periodoTexto) || vista !== 'unidades'
  const cantidad = grupos.filter((grupo) => grupo.valor).length + (periodoTexto ? 1 : 0)
  // Orden de la lista (se recuerda): «Costo» solo si el rol ve costos.
  const selectorOrden = onOrden ? (
    <Select
      value={orden}
      onChange={(evento) => onOrden(evento.target.value)}
      className="min-h-11 w-full min-w-0 text-xs lg:min-h-9 lg:w-[9.5rem]"
      aria-label="Orden del inventario"
      title="Se recuerda tu último orden"
      data-testid="stock-orden"
    >
      {ordenesStockVisibles(verProveedor).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
    </Select>
  ) : null
  const limpiar = hayPuestos ? (
    <button
      type="button"
      data-testid="filtros-limpiar"
      onClick={() => { onLimpiar(); setHoja(false) }}
      className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-fono-light transition hover:underline lg:min-h-9"
    >
      Limpiar filtros
    </button>
  ) : null

  if (compacto) {
    return (
      <div data-testid="filtros-stock" className="flex items-center">
        <button
          type="button"
          data-testid="filtros-abrir"
          aria-haspopup="dialog"
          aria-label={cantidad ? `Filtros, ${cantidad} activos` : 'Filtros'}
          onClick={() => setHoja(true)}
          className={cn(
            'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
            cantidad ? 'border-fono bg-fono/10 text-fore' : 'border-ink-500 text-mute hover:text-fore',
          )}
        >
          <Icon name="filter" className="h-4 w-4" />
          <span className="max-sm:sr-only">Filtros</span>{cantidad ? <span aria-hidden="true">{`· ${cantidad}`}</span> : ''}
        </button>
        <Modal open={hoja} onClose={() => setHoja(false)} title="Filtros" size="corto">
          <div data-testid="filtros-hoja" className="space-y-4">
            {grupos.map((grupo) => (
              <div key={grupo.id} className="space-y-1.5">
                <p className={ROTULO_DATO}>{grupo.etiqueta}</p>
                <Opciones etiqueta={grupo.etiqueta} testId={grupo.id} valor={grupo.valor} opciones={grupo.opciones} textoTodos={grupo.textoTodos} onElegir={grupo.elegir} />
              </div>
            ))}
            {selectorOrden ? (
              <div className="space-y-1.5">
                <p className={ROTULO_DATO}>Orden</p>
                {selectorOrden}
              </div>
            ) : null}
            {vista === 'vendidos' ? (
              <div className="space-y-1.5">
                <p className={ROTULO_DATO}>Período</p>
                <Opciones etiqueta="Período de vendidos" testId="periodo" valor={filtros.periodo} opciones={PERIODOS.slice(1)} onElegir={cambiarPeriodo} />
                {fechas}
              </div>
            ) : null}
            <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-ink-600 bg-ink px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
              {limpiar || <span />}
              <button type="button" onClick={() => setHoja(false)} className="min-h-11 rounded-lg bg-fono px-4 text-sm font-semibold text-onbrand">Listo</button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }
  return (
    <div data-testid="filtros-stock" className="flex flex-wrap items-center gap-2">
      {grupos.map((grupo) => (
        <ChipFiltro key={grupo.id} etiqueta={grupo.etiqueta} testId={grupo.id} valorTexto={grupo.texto}>
          {(cerrar) => <Opciones etiqueta={grupo.etiqueta} testId={grupo.id} valor={grupo.valor} opciones={grupo.opciones} textoTodos={grupo.textoTodos} vertical onElegir={(id) => { grupo.elegir(id); cerrar() }} />}
        </ChipFiltro>
      ))}
      {vista === 'vendidos' ? (
        <ChipFiltro etiqueta="Período" testId="periodo" valorTexto={periodoTexto}>
          {(cerrar) => (
            <>
              <Opciones etiqueta="Período de vendidos" testId="periodo" valor={filtros.periodo} opciones={PERIODOS.slice(1)} vertical onElegir={(id) => { cambiarPeriodo(id); if (id !== 'rango') cerrar() }} />
              {fechas}
            </>
          )}
        </ChipFiltro>
      ) : null}
      {selectorOrden}
      {limpiar}
    </div>
  )
}
