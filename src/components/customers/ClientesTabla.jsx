import { useEffect, useRef, useState } from 'react'
import { gs } from '@/utils/calculos'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { normalizarBusqueda } from '@/utils/cliente'
import { telefonoVisible } from '@/utils/telefono'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import Icon from '@/components/shared/Icon'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { cn } from '@/lib/utils'
import BarraLote from '@/components/shared/BarraLote'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { temaV2Activo } from '@/lib/temaV2'
import { CeldaMoneda, IconAction, useToast } from '@/components/ui'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE, ROTULO_DATO } from '@/components/shared/tabla'
import { fechaCompacta, fechaLegible } from '@/utils/pedido'
import { ULTIMA_PLANTILLA_CLIENTES } from './customerMessaging'
// Tabla de clientes estilo Pedidos (#236, ajustada en #313): filas con aire y
// datos clave (contacto, tipo, pedidos, total gastado, última compra y deuda).
// Una sola acción visible por fila (el ojito del resumen rápido) y las demás
// (ficha completa, WhatsApp y plantilla) dentro del menú «…». En móvil la
// lista se muestra como tarjetas. Se mantienen el orden por columnas, la
// selección por lote y el WhatsApp con plantilla.
const GRID = 'grid min-w-[62rem] grid-cols-[2.75rem_minmax(0,1.4fr)_minmax(0,0.6fr)_3rem_minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_8rem] items-center gap-x-2'
const ULTIMA_PLANTILLA = ULTIMA_PLANTILLA_CLIENTES

const ciudadDe = (row) => row.addresses?.find(address => address.city)?.city || ''

const OPCION_MENU = 'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-fore transition hover:bg-ink-700'

// #313: una sola acción visible por fila (el resumen rápido) y el resto en
// «…»: abrir la ficha y el WhatsApp con su plantilla.
function MenuAccionesCliente({ row, telefono, templates, deuda, ultima, onPerfil, onResumen }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (event) => { if (!caja.current?.contains(event.target)) setAbierto(false) }
    const escape = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])
  return (
    <span ref={caja} className="relative inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <IconAction icon="eye" tone="fono" size="touch" label={`Resumen rápido de ${row.name || 'cliente'}`} onClick={() => onResumen?.(row)} />
      <button
        type="button"
        data-testid="cliente-mas-acciones"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Más acciones de ${row.name || 'cliente'}`}
        title="Más acciones"
        onClick={() => setAbierto((valor) => !valor)}
        className="grid h-11 w-11 place-items-center rounded-lg border border-ink-500 text-base font-bold leading-none text-mute transition hover:border-fono hover:text-fore"
      >
        <span aria-hidden="true" className="-mt-1.5">…</span>
      </button>
      {abierto && (
        <div role="menu" aria-label={`Acciones de ${row.name || 'cliente'}`} className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-xl">
          <button
            type="button"
            role="menuitem"
            aria-label={`Ver detalle completo de ${row.name || 'cliente'}`}
            className={OPCION_MENU}
            onClick={() => { setAbierto(false); onPerfil?.(row) }}
          >
            <Icon name="external" className="h-3.5 w-3.5 shrink-0 text-mute" />
            Ver ficha completa
          </button>
          {telefono && (
            <WhatsAppMenu
              variant="items"
              telefono={telefono}
              countryCode={row.countryCode}
              category="CUSTOMERS"
              storageKey={ULTIMA_PLANTILLA}
              plantillas={templates}
              title={row.name}
              contexto={{
                cliente: row.name || '',
                nombre: row.name || '',
                saldo_pendiente: deuda > 0 ? gs(deuda) : '',
                ultima_compra: ultima ? fechaLegible(ultima) : '',
              }}
            />
          )}
        </div>
      )}
    </span>
  )
}

const chipTipo = (row, v2) => (
  <span className={cn('inline-block w-fit max-w-full shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold', v2 && 'v2-chip uppercase', row.wholesale ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-500 bg-ink-700/40 text-mute')}>
    {row.wholesale ? 'Mayorista' : 'Cliente final'}
  </span>
)

// #313 · móvil: una tarjeta por cliente en lugar de la tabla comprimida.
function TarjetaCliente({ row, templates, seleccionado, onAlternar, onPerfil, onResumen, v2 }) {
  const telefono = row.phones?.[0] || row.phone || ''
  const telefonoMostrado = telefonoVisible(telefono, row.countryCode)
  const deuda = Number(row.stats?.pendingPyg || 0)
  const ultima = row.stats?.lastOrderAt || null
  const pedidos = row.stats?.orders || 0
  return (
    <article
      data-testid="cliente-fila"
      data-id={row.id}
      onClick={() => onPerfil?.(row)}
      className="cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 p-3 transition hover:border-fono/40 hover:bg-ink-700/50"
    >
      <div className="flex items-start gap-2">
        <label className="-my-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar a ${row.name || 'cliente'}`} checked={seleccionado} onChange={onAlternar} />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn('truncate', CELDA_IDENTIDAD_GRANDE)} title={row.name}>{row.name || 'Sin nombre'}</p>
              <p className={cn('mt-0.5 truncate', CELDA_DATO)} title={[telefonoMostrado, row.email].filter(Boolean).join(' · ')}>
                {telefonoMostrado || 'Sin teléfono'}{row.email ? ` · ${row.email}` : ''}
              </p>
            </div>
            {chipTipo(row, v2)}
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-mute">Total gastado</dt>
              <dd className="text-right font-semibold"><CeldaMoneda valor={row.stats?.totalSpentPyg || 0} className={cn('text-sm text-fore', v2 && 'v2-numero')} /></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-mute">Deuda</dt>
              <dd className="text-right font-semibold">{deuda > 0 ? <CeldaMoneda valor={deuda} tono="warn" className={v2 ? 'v2-numero' : undefined} /> : <span className={CELDA_DATO}>Sin deuda</span>}</dd>
            </div>
          </dl>
          <p className={cn('mt-2 text-[11px] text-mute', v2 && 'v2-numero')}>
            {ultima ? `Última compra ${fechaCompacta(ultima)}` : 'Sin compras'} · {pedidos} {pedidos === 1 ? 'pedido' : 'pedidos'}
          </p>
        </div>
      </div>
      <div className="mt-1 flex justify-end">
        <MenuAccionesCliente row={row} telefono={telefono} templates={templates} deuda={deuda} ultima={ultima} onPerfil={onPerfil} onResumen={onResumen} />
      </div>
    </article>
  )
}

export default function ClientesTabla({ rows, templates, onPerfil, onResumen, onUnificar }) {
  // Vista previa v2 (#241 lote B): números de consola y chips pill en la fila.
  const v2 = temaV2Activo()
  // #313: en móvil la lista se muestra como tarjetas (no tabla comprimida).
  const angosta = usePantallaAngosta('(min-width: 768px)')
  // Sin orden de columna, respeta el orden del servidor (actividad reciente).
  const [orden, setOrden] = useState(null)
  const toast = useToast()
  const [seleccionados, setSeleccionados] = useState([])

  const ordenarPor = (key) => setOrden(current => current?.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'pedidos' || key === 'total' ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex min-h-11 items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore md:min-h-0', orden?.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden?.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )

  const filas = orden ? [...rows].sort((a, b) => {
    const factor = orden.dir === 'asc' ? 1 : -1
    if (orden.key === 'cliente') return normalizarBusqueda(a.name).localeCompare(normalizarBusqueda(b.name), 'es') * factor
    if (orden.key === 'tipo') return (Number(Boolean(b.wholesale)) - Number(Boolean(a.wholesale))) * factor
    if (orden.key === 'pedidos') return ((a.stats?.orders || 0) - (b.stats?.orders || 0)) * factor
    if (orden.key === 'total') return ((a.stats?.totalSpentPyg || 0) - (b.stats?.totalSpentPyg || 0)) * factor
    if (orden.key === 'ultima') return ((a.stats?.lastOrderAt || '') < (b.stats?.lastOrderAt || '') ? -1 : 1) * factor
    if (orden.key === 'deuda') return ((a.stats?.pendingPyg || 0) - (b.stats?.pendingPyg || 0)) * factor
    return 0
  }) : rows

  const telefonoDe = (row) => row.phones?.[0] || row.phone || ''
  const elegidas = () => filas.filter((row) => seleccionados.includes(row.id))

  async function copiarTelefonos() {
    const numeros = elegidas().map((row) => telefonoDe(row)).filter(Boolean)
    if (await copiarAlPortapapeles(numeros.join('\n'))) toast.success(`${numeros.length} ${numeros.length === 1 ? 'teléfono copiado' : 'teléfonos copiados'}.`)
    else toast.error('No se pudieron copiar los teléfonos.')
  }

  function exportarSeleccionados() {
    const lista = elegidas()
    const filasCsv = [['Nombre', 'Teléfono', 'Correo', 'RUC', 'Ciudad', 'Pedidos', 'Total gastado'], ...lista.map((row) => [row.name || '', telefonoDe(row), row.email || '', row.document || '', ciudadDe(row), String(row.stats?.orders || 0), String(row.stats?.totalSpentPyg || 0)])]
    const csv = filasCsv.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(',')).join('\n')
    descargarCsvCliente('mobos-clientes-seleccionados.csv', csv)
    toast.success(`${lista.length} ${lista.length === 1 ? 'cliente exportado' : 'clientes exportados'}.`)
  }

  return (
    <div className="space-y-2">
      <BarraLote cantidad={seleccionados.length} onLimpiar={() => setSeleccionados([])}>
        <button type="button" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore md:min-h-0" onClick={copiarTelefonos}>Copiar teléfonos</button>
        <button type="button" className="min-h-11 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore md:min-h-0" onClick={exportarSeleccionados}>Exportar CSV</button>
        {/* Unificar duplicados (#268): con exactamente dos fichas elegidas. */}
        {onUnificar && seleccionados.length === 2 && (
          <button type="button" data-testid="unificar-seleccionados" className="min-h-11 rounded-lg border border-fono/50 px-2 py-1 text-xs font-semibold text-fono-light transition hover:bg-fono/10 md:min-h-0" onClick={() => { const [a, b] = elegidas(); if (a && b) onUnificar(a, b) }}>Unificar seleccionados</button>
        )}
      </BarraLote>
    {angosta ? (
      <div className="space-y-2" data-testid="clientes-tabla">
        {/* Paridad con la tabla: el mismo selector de lote en las tarjetas. */}
        <label className="flex h-11 w-fit cursor-pointer items-center gap-2 px-1 text-xs text-mute" title="Seleccionar visibles">
          <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" checked={filas.length > 0 && seleccionados.length === filas.length} onChange={() => setSeleccionados((actuales) => seleccionarTodos(filas, actuales))} />
          Seleccionar visibles
        </label>
        {filas.map(row => (
          <TarjetaCliente
            key={row.id}
            row={row}
            templates={templates}
            seleccionado={seleccionados.includes(row.id)}
            onAlternar={() => setSeleccionados((actuales) => alternarId(actuales, row.id))}
            onPerfil={onPerfil}
            onResumen={onResumen}
            v2={v2}
          />
        ))}
      </div>
    ) : (
    <div className="overflow-x-auto" data-testid="clientes-tabla">
      <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
        {/* Selección por lote: el cuadradito de 16 px vive en un área táctil de
            44 px (#249 H4); el clic de la fila queda como atajo aparte. */}
        <label className="flex h-11 w-11 -my-2 cursor-pointer items-center justify-center" title="Seleccionar visibles">
          <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" checked={filas.length > 0 && seleccionados.length === filas.length} onChange={() => setSeleccionados((actuales) => seleccionarTodos(filas, actuales))} />
        </label>
        {encabezado('cliente', 'Cliente')}
        {encabezado('tipo', 'Tipo')}
        {encabezado('pedidos', 'Pedidos', 'justify-center')}
        {encabezado('total', 'Total gastado', 'justify-end')}
        {encabezado('ultima', 'Última compra')}
        {encabezado('deuda', 'Deuda', 'justify-end')}
        <span className={cn('text-right', ROTULO_DATO)}>Acciones</span>
      </div>
      <div className="space-y-2">
        {filas.map(row => {
          const telefono = row.phones?.[0] || row.phone || ''
          const telefonoMostrado = telefonoVisible(telefono, row.countryCode)
          const deuda = Number(row.stats?.pendingPyg || 0)
          const ultima = row.stats?.lastOrderAt || null
          return (
            <div
              key={row.id}
              data-testid="cliente-fila"
              data-id={row.id}
              // El clic es un atajo (mouse/touch): los accesos accesibles por
              // teclado/lector son el ojito y el «…» con aria-label.
              onClick={() => onPerfil?.(row)}
              className={cn(GRID, 'cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-3 transition hover:border-fono/40 hover:bg-ink-700/50')}
            >
              <label className="flex h-11 w-11 -my-2 cursor-pointer items-center justify-center" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar a ${row.name || 'cliente'}`} checked={seleccionados.includes(row.id)} onChange={() => setSeleccionados((actuales) => alternarId(actuales, row.id))} />
              </label>
              <span className="min-w-0">
                <span className={cn('block', CELDA_IDENTIDAD_GRANDE)} title={row.name}>{row.name || 'Sin nombre'}</span>
                <span className={cn(CELDA_DATO, 'block')} title={[telefonoMostrado, row.email].filter(Boolean).join(' · ')}>
                  {telefonoMostrado || 'Sin teléfono'}{row.email ? ` · ${row.email}` : ''}
                </span>
              </span>
              {chipTipo(row, v2)}
              <span className={cn('truncate text-center text-sm font-semibold tabular-nums', v2 && 'v2-numero')}>{row.stats?.orders || 0}</span>
              {/* Los montos van a la derecha y sin pisar los accesos (#313). */}
              <span className="flex min-w-0 justify-end"><CeldaMoneda valor={row.stats?.totalSpentPyg || 0} className={cn('text-sm text-fore', v2 && 'v2-numero')} /></span>
              <span className={cn('truncate', CELDA_DATO)} title={ultima ? fechaLegible(ultima) : undefined}>{ultima ? fechaCompacta(ultima) : '—'}</span>
              <span className="flex min-w-0 justify-end">{deuda > 0 ? <CeldaMoneda valor={deuda} tono="warn" className={v2 ? 'v2-numero' : undefined} /> : <span className={CELDA_DATO}>Sin deuda</span>}</span>
              <MenuAccionesCliente row={row} telefono={telefono} templates={templates} deuda={deuda} ultima={ultima} onPerfil={onPerfil} onResumen={onResumen} />
            </div>
          )
        })}
      </div>
    </div>
    )}
    </div>
  )
}
