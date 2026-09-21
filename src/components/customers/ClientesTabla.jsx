import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { normalizarBusqueda } from '@/utils/cliente'
import { telefonoVisible } from '@/utils/telefono'
import { readCustomerMetadata } from './customerMessaging'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { cn } from '@/lib/utils'
import BarraLote from '@/components/shared/BarraLote'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { IconAction, useToast } from '@/components/ui'

// Tabla de clientes alineada: una fila por persona, encabezados ordenables y
// acciones compactas (perfil al hacer clic, WhatsApp con plantilla). Entra sin
// scroll horizontal en desktop: todo trunca y el espacio se reparte con
// prioridad Cliente → Total gastado → Teléfono → Tipo → resto.
const GRID = 'grid min-w-[58rem] grid-cols-[1.5rem_minmax(0,1.7fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_2.5rem_minmax(0,0.7fr)_minmax(0,0.75fr)_minmax(0,0.4fr)_minmax(0,1.2fr)_2.5rem_6.5rem] items-center gap-x-2'
const ULTIMA_PLANTILLA = 'mobos:clientes:plantilla-wa'

const ciudadDe = (row) => row.addresses?.find(address => address.city)?.city || ''
export const notaInterna = (notes) => {
  if (typeof notes !== 'string' || !notes.trim()) return ''
  if (readCustomerMetadata(notes).phones.length) return ''
  return notes.trim()
}

export default function ClientesTabla({ rows, templates, onPerfil }) {
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
    return 0
  }) : rows

  const telefonoDe = (row) => row.phones?.[0] || row.phone || ''
  const elegidas = () => filas.filter((row) => seleccionados.includes(row.id))

  async function copiarTelefonos() {
    const numeros = elegidas().map((row) => telefonoDe(row)).filter(Boolean)
    try {
      await navigator.clipboard.writeText(numeros.join('\n'))
      toast.success(`${numeros.length} ${numeros.length === 1 ? 'teléfono copiado' : 'teléfonos copiados'}.`)
    } catch { toast.error('No se pudieron copiar los teléfonos.') }
  }

  function exportarSeleccionados() {
    const lista = elegidas()
    const filasCsv = [['Nombre', 'Teléfono', 'Correo', 'RUC', 'Ciudad', 'Pedidos', 'Total gastado'], ...lista.map((row) => [row.name || '', telefonoDe(row), row.email || '', row.document || '', ciudadDe(row), String(row.stats?.orders || 0), String(row.stats?.totalSpentPyg || 0)])]
    const csv = filasCsv.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'mobos-clientes-seleccionados.csv'
    enlace.click()
    URL.revokeObjectURL(url)
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
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Teléfono</span>
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Email</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">RUC</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Ciudad</span>
        {encabezado('pedidos', 'Pedidos', 'justify-center')}
        {encabezado('total', 'Total gastado', 'justify-end')}
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Nota</span>
        <span className="text-right text-[10px] font-bold uppercase tracking-wider text-mute">Acciones</span>
      </div>
      <div className="space-y-2">
        {filas.map(row => {
          const nota = notaInterna(row.notes)
          const telefono = row.phones?.[0] || row.phone || ''
          const telefonoMostrado = telefonoVisible(telefono, row.countryCode)
          return (
            <div
              key={row.id}
              data-testid="cliente-fila"
              role="button"
              tabIndex={0}
              onClick={() => onPerfil?.(row)}
              onKeyDown={event => { if (event.key === 'Enter') onPerfil?.(row) }}
              className={cn(GRID, 'cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-2.5 transition hover:border-fono/40 hover:bg-ink-700/50')}
            >
              <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar a ${row.name || 'cliente'}`} checked={seleccionados.includes(row.id)} onChange={() => setSeleccionados((actuales) => alternarId(actuales, row.id))} />
              </span>
              <span className="truncate text-sm font-semibold" title={row.name}>{row.name || 'Sin nombre'}</span>
              <span className={cn('inline-block w-fit max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold', row.wholesale ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-500 bg-ink-700/40 text-mute')}>
                {row.wholesale ? 'Mayorista' : 'Cliente final'}
              </span>
              <span className="truncate text-xs text-mute tabular-nums" title={telefono || undefined}>{telefonoMostrado || '—'}</span>
              <span className="flex justify-center">
                {row.email
                  ? <Icon name="check" role="img" title="Con correo" aria-label="Con correo" aria-hidden={false} className="h-4 w-4 text-ok" />
                  : <Icon name="close" role="img" title="Sin correo" aria-label="Sin correo" aria-hidden={false} className="h-3.5 w-3.5 text-mute" />}
              </span>
              <span className="truncate text-xs text-mute tabular-nums">{row.document || '—'}</span>
              <span className="truncate text-xs text-mute">{ciudadDe(row) || '—'}</span>
              <span className="truncate text-center text-xs font-semibold tabular-nums">{row.stats?.orders || 0}</span>
              <span className="truncate text-right text-sm font-bold tabular-nums text-fore">{gs(row.stats?.totalSpentPyg || 0)}</span>
              <span className="flex justify-center">
                {nota
                  ? <Icon name="report" role="img" title={nota} aria-label={`Nota interna: ${nota}`} aria-hidden={false} className="h-4 w-4 cursor-help text-fono-light" />
                  : <span className="text-xs text-mute">—</span>}
              </span>
              <span className="flex items-center justify-end gap-1">
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
                      ultima_compra: row.stats?.lastOrderAt ? new Date(row.stats.lastOrderAt).toLocaleDateString('es-PY') : '',
                    }}
                  />
                ) : <span className="text-xs text-mute">—</span>}
                <span onClick={(event) => event.stopPropagation()}>
                  <IconAction icon="eye" tone="fono" label={`Ver perfil de ${row.name || 'cliente'}`} onClick={() => onPerfil?.(row)} />
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
