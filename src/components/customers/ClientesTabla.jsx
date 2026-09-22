import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { normalizarBusqueda } from '@/utils/cliente'
import { telefonoVisible } from '@/utils/telefono'
import { readCustomerMetadata } from './customerMessaging'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { cn } from '@/lib/utils'
import BarraLote from '@/components/shared/BarraLote'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { CeldaMoneda, IconAction, useToast } from '@/components/ui'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE, ROTULO_DATO } from '@/components/shared/tabla'
import { fechaCompacta, fechaLegible } from '@/utils/pedido'
import { ULTIMA_PLANTILLA_CLIENTES } from './customerMessaging'
// Tabla de clientes estilo Pedidos (#236): filas con aire y datos clave
// (contacto, tipo, pedidos, total gastado, última compra y deuda) con DOS
// accesos por cliente: el ojito abre el resumen rápido (popup) y el ícono de
// detalle el perfil completo. Se mantienen el orden por columnas, la selección
// por lote y el WhatsApp con plantilla.
const GRID = 'grid min-w-[62rem] grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,0.6fr)_3rem_minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_8rem] items-center gap-x-2'
const ULTIMA_PLANTILLA = ULTIMA_PLANTILLA_CLIENTES

const ciudadDe = (row) => row.addresses?.find(address => address.city)?.city || ''
export const notaInterna = (notes) => {
  if (typeof notes !== 'string' || !notes.trim()) return ''
  if (readCustomerMetadata(notes).phones.length) return ''
  return notes.trim()
}

export default function ClientesTabla({ rows, templates, onPerfil, onResumen }) {
  // Sin orden de columna, respeta el orden del servidor (actividad reciente).
  const [orden, setOrden] = useState(null)
  const toast = useToast()
  const [seleccionados, setSeleccionados] = useState([])

  const ordenarPor = (key) => setOrden(current => current?.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'pedidos' || key === 'total' ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden?.key === key ? 'text-fono-light' : 'text-mute', extra)}>
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
        <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={copiarTelefonos}>Copiar teléfonos</button>
        <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={exportarSeleccionados}>Exportar CSV</button>
      </BarraLote>
    <div className="overflow-x-auto" data-testid="clientes-tabla">
      <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
        <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={filas.length > 0 && seleccionados.length === filas.length} onChange={() => setSeleccionados((actuales) => seleccionarTodos(filas, actuales))} />
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
              // teclado/lector son los dos íconos con aria-label.
              onClick={() => onPerfil?.(row)}
              className={cn(GRID, 'cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-3 transition hover:border-fono/40 hover:bg-ink-700/50')}
            >
              <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar a ${row.name || 'cliente'}`} checked={seleccionados.includes(row.id)} onChange={() => setSeleccionados((actuales) => alternarId(actuales, row.id))} />
              </span>
              <span className="min-w-0">
                <span className={cn('block', CELDA_IDENTIDAD_GRANDE)} title={row.name}>{row.name || 'Sin nombre'}</span>
                <span className={cn(CELDA_DATO, 'block')} title={[telefonoMostrado, row.email].filter(Boolean).join(' · ')}>
                  {telefonoMostrado || 'Sin teléfono'}{row.email ? ` · ${row.email}` : ''}
                </span>
              </span>
              <span className={cn('inline-block w-fit max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold', row.wholesale ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-500 bg-ink-700/40 text-mute')}>
                {row.wholesale ? 'Mayorista' : 'Cliente final'}
              </span>
              <span className="truncate text-center text-sm font-semibold tabular-nums">{row.stats?.orders || 0}</span>
              <span className="truncate text-right"><CeldaMoneda valor={row.stats?.totalSpentPyg || 0} className="text-sm text-fore" /></span>
              <span className={cn('truncate', CELDA_DATO)} title={ultima ? fechaLegible(ultima) : undefined}>{ultima ? fechaCompacta(ultima) : '—'}</span>
              <span className="truncate text-right">{deuda > 0 ? <CeldaMoneda valor={deuda} tono="warn" /> : <span className={CELDA_DATO}>Sin deuda</span>}</span>
              <span className="flex items-center justify-end gap-1.5">
                {telefono ? (
                  <WhatsAppMenu
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
                ) : <span className="text-xs text-mute">—</span>}
                <span onClick={(event) => event.stopPropagation()}>
                  <IconAction icon="eye" tone="fono" size="touch" label={`Resumen rápido de ${row.name || 'cliente'}`} onClick={() => onResumen?.(row)} />
                </span>
                <span onClick={(event) => event.stopPropagation()}>
                  <IconAction icon="external" size="touch" label={`Ver detalle completo de ${row.name || 'cliente'}`} onClick={() => onPerfil?.(row)} />
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}
