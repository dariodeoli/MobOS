import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Input, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { resources } from '@/lib/api'
import {
  DESTINOS, FONDO_FILA, MATCHES, NOMBRE_CONDICION, agruparPorBloque, arreglosDe, avisosDe, condicionFila, erroresDe, formatoCosto, imeiConfirmable, nombreModelo,
} from '@/lib/llegada'

// Llegada de mercadería (#408 G): la grilla del pegado, una fila por equipo como
// la planilla. Fondo suave por destino/condición (36–40 px en escritorio, tarjeta
// por fila en celular). Cada hallazgo muestra su arreglo al lado: elegir el
// producto, corregir el IMEI, «el IMEI es correcto», vincular pedido/cliente o
// elegir la sucursal. Un resultado elegido reemplaza su buscador por una tarjeta
// de una fila con cambiar/quitar (regla de densidad).

const COLUMNAS = 'md:grid md:grid-cols-[1.75rem_minmax(0,1.7fr)_minmax(0,1.2fr)_3.25rem_4.25rem_minmax(0,1fr)_6rem_9rem] md:items-center md:gap-2'
const CAMPO_DENSO = 'h-11 min-h-11 text-sm md:h-8 md:min-h-8'

const listaDe = (respuesta) => (Array.isArray(respuesta) ? respuesta : respuesta?.items || respuesta?.products || respuesta?.customers || respuesta?.orders || [])
const nombreProducto = (producto) => producto?.name || producto?.nombre || ''

function useBusqueda(buscar, consulta, activo) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    if (!activo) return undefined
    let vigente = true
    setCargando(true)
    const temporizador = setTimeout(() => {
      Promise.resolve(buscar(consulta))
        .then((respuesta) => { if (vigente) setFilas(listaDe(respuesta).slice(0, 6)) })
        .catch(() => { if (vigente) setFilas([]) })
        .finally(() => { if (vigente) setCargando(false) })
    }, 220)
    return () => { vigente = false; clearTimeout(temporizador) }
  }, [buscar, consulta, activo])
  return { filas, cargando }
}

// Buscador de producto: parte del modelo pegado y lista coincidencias del catálogo.
function ElegirProducto({ inicial, onElegir, deshabilitado }) {
  const [consulta, setConsulta] = useState(inicial)
  const buscar = useMemo(() => (texto) => resources.products.list(texto), [])
  const { filas, cargando } = useBusqueda(buscar, consulta, true)
  return (
    <div className="min-w-0 flex-1 basis-64 space-y-1" data-testid="llegada-elegir-producto">
      <Input aria-label="Buscar producto del catálogo" className={CAMPO_DENSO} value={consulta} onChange={(evento) => setConsulta(evento.target.value)} placeholder="Buscar en el catálogo…" disabled={deshabilitado} />
      {filas.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-ink-600 bg-ink text-sm" role="listbox" aria-label="Productos posibles">
          {filas.map((producto) => (
            <li key={producto.id}>
              <button type="button" role="option" aria-selected="false" className="flex min-h-11 w-full items-center px-2.5 text-left hover:bg-ink-800 md:min-h-8" onClick={() => onElegir(producto.id)} disabled={deshabilitado}>
                <span className="truncate">{nombreProducto(producto)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!cargando && !filas.length && consulta.trim() && <p className="text-xs text-mute">Sin coincidencias: creá el producto en el catálogo.</p>}
    </div>
  )
}

// Arreglo del IMEI: campo + guardar, y «el IMEI es correcto» cuando termina en 000 y pasa Luhn.
function ArreglarSerial({ linea, onGuardar, deshabilitado }) {
  const [valor, setValor] = useState(linea.serial || '')
  const confirmable = imeiConfirmable(valor) && erroresDe(linea).some((item) => item.code === 'IMEI_EXCEL')
  const guardar = (confirmar) => { if (valor.trim()) onGuardar({ serial: valor.trim(), ...(confirmar ? { confirmSerial: true } : {}) }) }
  return (
    <form className="flex flex-wrap items-center gap-1.5" onSubmit={(evento) => { evento.preventDefault(); guardar(false) }} data-testid="llegada-arreglar-serial">
      <Input aria-label={`IMEI o serie de la fila ${linea.rowIndex + 1}`} className={`${CAMPO_DENSO} w-44 font-mono`} value={valor} onChange={(evento) => setValor(evento.target.value)} placeholder="IMEI o serie" inputMode="text" autoComplete="off" disabled={deshabilitado} />
      <Button type="submit" size="sm" variant="outline" disabled={deshabilitado || !valor.trim()}>Guardar</Button>
      {confirmable && <Button type="button" size="sm" variant="outline" onClick={() => guardar(true)} disabled={deshabilitado}>El IMEI es correcto</Button>}
    </form>
  )
}

// Vínculo pre-vendido: pedido o cliente. Elegido, queda una tarjeta con quitar.
function VincularVenta({ linea, etiqueta, onVincular, deshabilitado }) {
  const [consulta, setConsulta] = useState(linea.raw?.hints?.customerHint || '')
  const [abierto, setAbierto] = useState(false)
  const buscar = useMemo(() => async (texto) => {
    const [clientes, pedidos] = await Promise.all([
      resources.customers.list(texto).catch(() => []),
      resources.orders.list().catch(() => []),
    ])
    const clave = String(texto || '').toLowerCase().replace('#', '')
    const coincide = (valor) => String(valor || '').toLowerCase().includes(clave)
    const filasPedidos = listaDe(pedidos).filter((pedido) => coincide(pedido.number ?? pedido.code) || coincide(pedido.customerName || pedido.customer?.name)).slice(0, 3)
      .map((pedido) => ({ tipo: 'pedido', id: pedido.id, nombre: `Pedido ${pedido.number ?? pedido.code ?? ''} · ${pedido.customerName || pedido.customer?.name || 'Cliente'}` }))
    const filasClientes = listaDe(clientes).slice(0, 4).map((cliente) => ({ tipo: 'cliente', id: cliente.id, nombre: cliente.name || cliente.nombre }))
    return [...filasPedidos, ...filasClientes]
  }, [])
  const { filas } = useBusqueda(buscar, consulta, abierto)
  if (etiqueta) {
    return (
      <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-ink-600 bg-ink px-2 text-xs" data-testid="llegada-vinculo">
        <Icon name="user" className="h-3.5 w-3.5 text-mute" />
        <span className="max-w-48 truncate">{etiqueta}</span>
        <button type="button" className="inline-flex h-11 w-8 items-center justify-center text-mute hover:text-fore md:h-6" aria-label="Quitar el vínculo" onClick={() => onVincular({ orderId: null, orderItemId: null, customerId: null })} disabled={deshabilitado}>
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }
  if (!abierto) {
    return <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)} disabled={deshabilitado}>Vincular pedido o cliente</Button>
  }
  return (
    <div className="min-w-0 flex-1 basis-64 space-y-1" data-testid="llegada-buscar-vinculo">
      <Input aria-label="Buscar pedido o cliente" className={CAMPO_DENSO} value={consulta} onChange={(evento) => setConsulta(evento.target.value)} placeholder="Pedido #… o nombre del cliente" autoFocus disabled={deshabilitado} />
      {filas.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-ink-600 bg-ink text-sm">
          {filas.map((fila) => (
            <li key={`${fila.tipo}-${fila.id}`}>
              <button type="button" className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-ink-800 md:min-h-8" onClick={() => { onVincular(fila.tipo === 'pedido' ? { orderId: fila.id, label: fila.nombre } : { customerId: fila.id, label: fila.nombre }); setAbierto(false) }} disabled={deshabilitado}>
                <Badge color={fila.tipo === 'pedido' ? 'blue' : 'slate'}>{fila.tipo === 'pedido' ? 'Pedido' : 'Cliente'}</Badge>
                <span className="truncate">{fila.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ElegirSucursal({ sucursales, linea, onElegir, deshabilitado }) {
  return (
    <Select aria-label={`Sucursal de destino de la fila ${linea.rowIndex + 1}`} className={`${CAMPO_DENSO} w-48`} value={linea.destinationBranchId || ''} onChange={(evento) => onElegir(evento.target.value)} disabled={deshabilitado}>
      <option value="">Elegí la sucursal…</option>
      {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.name}</option>)}
    </Select>
  )
}

function Hallazgos({ linea, sucursales, aplicar, deshabilitado }) {
  const errores = erroresDe(linea)
  const avisos = avisosDe(linea)
  if (!errores.length && !avisos.length) return null
  const arreglos = arreglosDe(linea)
  const sinVinculo = !(linea.orderId || linea.orderItemId || linea.customerId)
  return (
    <div className="space-y-1.5 px-2 pb-2 md:col-span-8 md:pl-9" data-testid="llegada-hallazgos">
      {errores.map((item) => (
        <p key={`${item.code}-${item.message}`} role="alert" className="flex items-start gap-1.5 text-xs text-bad"><Icon name="alert"className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{item.message}</span></p>
      ))}
      {avisos.map((item) => (
        <p key={`${item.code}-${item.message}`} className="flex items-start gap-1.5 text-xs text-warn"><Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{item.message}</span></p>
      ))}
      <div className="flex flex-wrap items-start gap-2">
        {arreglos.includes('producto') && <ElegirProducto inicial={linea.raw?.modelText || ''} onElegir={(productId) => aplicar({ productId })} deshabilitado={deshabilitado} />}
        {arreglos.includes('serial') && <ArreglarSerial key={`${linea.id}-${linea.serial || ''}`} linea={linea} onGuardar={(cuerpo) => aplicar(cuerpo)} deshabilitado={deshabilitado} />}
        {arreglos.includes('sucursal') && <ElegirSucursal sucursales={sucursales} linea={linea} onElegir={(destinationBranchId) => aplicar({ destinationBranchId })} deshabilitado={deshabilitado} />}
        {arreglos.includes('vinculo') && sinVinculo && <VincularVenta linea={linea} etiqueta="" onVincular={({ label: etiqueta, ...cuerpo }) => aplicar(cuerpo, etiqueta)} deshabilitado={deshabilitado} />}
      </div>
    </div>
  )
}

function Fila({ linea, numero, sucursales, etiquetaVinculo, onPatch, ocupada, soloLectura }) {
  const condicion = condicionFila(linea)
  const errores = erroresDe(linea).length
  const noLlego = linea.match === 'NO_LLEGO'
  const coincidencia = MATCHES[linea.match] || MATCHES.SOBRANTE
  const vinculada = Boolean(linea.orderId || linea.orderItemId || linea.customerId)
  const etiqueta = vinculada ? (etiquetaVinculo || (linea.orderNumber ? `Pedido #${linea.orderNumber}` : linea.raw?.hints?.orderNumber ? `Pedido #${linea.raw.hints.orderNumber}` : linea.raw?.hints?.customerHint || 'Pedido o cliente vinculado')) : ''
  const aplicar = (cuerpo, etiquetaNueva) => onPatch(linea.id, cuerpo, etiquetaNueva)
  return (
    <div className={`border-b border-ink-600/60 ${FONDO_FILA[condicion]} ${errores ? 'border-l-2 border-l-bad' : ''}`} data-testid="llegada-fila" data-condicion={condicion} data-errores={errores}>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 md:min-h-9 md:py-0.5 ${COLUMNAS}`}>
        <span className="hidden text-xs tabular-nums text-mute md:block">{numero}</span>
        <div className="min-w-0 basis-full md:basis-auto">
          <p className="truncate text-sm font-medium" title={nombreModelo(linea)}>{nombreModelo(linea)}</p>
          {linea.batteryPct != null && <p className="text-[11px] text-mute md:hidden">Batería {linea.batteryPct}%</p>}
        </div>
        <span className="min-w-0 truncate font-mono text-xs" title={linea.serial || ''}>{noLlego ? '—' : linea.serial || (linea.destination === 'FALTA_IMEI' ? 'Falta IMEI' : 'sin IMEI')}</span>
        <span className="text-xs text-mute md:text-center" title="Proveedor">{linea.supplier?.code || '—'}</span>
        <span className="text-xs tabular-nums md:text-right" title="Costo">{formatoCosto(linea)}</span>
        <span className="min-w-0 truncate text-xs text-mute" title={linea.note || ''}>{linea.note || ''}</span>
        <span className="flex items-center gap-1">
          <Badge color={coincidencia.color}>{coincidencia.label}</Badge>
        </span>
        {noLlego || soloLectura ? (
          <span className="text-xs text-mute">{NOMBRE_CONDICION[condicion]}</span>
        ) : (
          <Select aria-label={`Destino de la fila ${numero}`} className={`${CAMPO_DENSO} w-full md:w-36`} value={linea.destination} onChange={(evento) => aplicar({ destination: evento.target.value })} disabled={ocupada}>
            {DESTINOS.map((destino) => <option key={destino.value} value={destino.value}>{destino.label}</option>)}
          </Select>
        )}
      </div>
      {vinculada && !noLlego && (
        <div className="px-2 pb-1.5 md:pl-9">
          <VincularVenta linea={linea} etiqueta={etiqueta} onVincular={({ label: etiquetaNueva, ...cuerpo }) => aplicar(cuerpo, etiquetaNueva)} deshabilitado={ocupada || soloLectura} />
        </div>
      )}
      {!soloLectura && <Hallazgos linea={linea} sucursales={sucursales} aplicar={aplicar} deshabilitado={ocupada} />}
    </div>
  )
}

export default function GrillaPegado({ llegada, sucursales = [], onPatch, soloLectura = false }) {
  const [ocupada, setOcupada] = useState('')
  const etiquetas = useRef(new Map())
  const grupos = useMemo(() => agruparPorBloque(llegada?.lines || []), [llegada])
  let contador = 0

  async function parchar(lineId, cuerpo, etiqueta) {
    setOcupada(lineId)
    try {
      if (etiqueta) etiquetas.current.set(lineId, etiqueta)
      if ('orderId' in cuerpo && cuerpo.orderId === null) etiquetas.current.delete(lineId)
      await onPatch(lineId, cuerpo)
    } finally {
      setOcupada('')
    }
  }

  if (!grupos.length) return null
  return (
    <div className="overflow-hidden rounded-xl border border-ink-600" data-testid="llegada-grilla">
      <div className={`hidden border-b border-ink-600 bg-ink-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute ${COLUMNAS}`} role="presentation">
        <span>#</span><span>Modelo</span><span>IMEI / serie</span><span className="text-center">Prov.</span><span className="text-right">Costo</span><span>Nota</span><span>Match</span><span>Destino</span>
      </div>
      {grupos.map((grupo) => (
        <section key={grupo.clave} aria-label={`Bloque ${grupo.etiqueta}`} data-testid="llegada-bloque">
          <h3 className="flex items-center justify-between border-b border-ink-600 bg-ink-800/60 px-2 py-1 text-xs font-semibold">
            <span>{grupo.etiqueta}</span>
            <span className="font-normal text-mute">{grupo.lineas.length} fila{grupo.lineas.length === 1 ? '' : 's'}</span>
          </h3>
          {grupo.lineas.map((linea) => {
            contador += 1
            return (
              <Fila key={linea.id} linea={linea} numero={contador} sucursales={sucursales} etiquetaVinculo={etiquetas.current.get(linea.id)} onPatch={parchar} ocupada={ocupada === linea.id} soloLectura={soloLectura} />
            )
          })}
        </section>
      ))}
    </div>
  )
}
