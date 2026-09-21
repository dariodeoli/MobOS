import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { Badge, EmptyState, Input, Modal, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'

const MAX_POR_GRUPO = 5
const MIN_CARACTERES = 2

// Cada grupo declara el endpoint que consulta, el ícono del encabezado y la
// vista que abre. Los módulos de gestión solo se ofrecen si el rol los tiene
// habilitados en su navegación (`vistas`), para no llamar endpoints ajenos.
const GRUPOS = [
  { id: 'clientes', titulo: 'Clientes', icon: 'users', vista: 'clientes', siempre: true },
  { id: 'productos', titulo: 'Productos', icon: 'phone', vista: 'productos', siempre: true },
  { id: 'pedidos', titulo: 'Pedidos', icon: 'box', vista: 'pedidos', siempre: true },
  { id: 'cotizaciones', titulo: 'Cotizaciones', icon: 'report', vista: 'cotizaciones', siempre: true },
  { id: 'garantias', titulo: 'Garantías', icon: 'clock', vista: 'garantias' },
  { id: 'compras', titulo: 'Compras', icon: 'store', vista: 'compras' },
  { id: 'proveedores', titulo: 'Proveedores', icon: 'truck', vista: 'compras' },
  { id: 'unidades', titulo: 'Unidades', icon: 'package', vista: 'inventario', subtab: 'unidades' },
]

const VACIO = Object.fromEntries(GRUPOS.map(grupo => [grupo.id, []]))
const incluye = (texto, q) => String(texto || '').toLocaleLowerCase().includes(q)
const idOpcion = indice => `gs-opcion-${indice}`
const claveOpcion = (grupoId, filaId) => `${grupoId}:${filaId}`

const proyectarCliente = row => ({
  id: row.id,
  titulo: row.name || row.nombre || 'Cliente',
  subtitulo: [row.phone, row.document || row.email].filter(Boolean).join(' · ') || 'Sin datos',
  navegar: { q: row.name || row.nombre || '', clienteId: row.id },
})

const proyectarProducto = row => ({
  id: row.id,
  titulo: row.name || row.nombre || 'Producto',
  subtitulo: `SKU ${row.sku || '—'}${row.pricePyg != null && Number.isFinite(Number(row.pricePyg)) ? ` · ${gs(row.pricePyg)}` : ''}`,
  navegar: {},
})

const proyectarPedido = row => ({
  id: row.id,
  titulo: codigoPedido(row.orderNumber || row.codigo) || `Pedido ${row.id}`,
  subtitulo: row.customer?.name || row.cliente || 'Consumidor final',
  navegar: { orderId: row.id },
})

const proyectarCotizacion = row => ({
  id: row.id,
  titulo: row.number || `Cotización ${row.id}`,
  subtitulo: [row.customerName, row.status].filter(Boolean).join(' · ') || 'Sin cliente',
  navegar: { q: row.number || row.customerName || '' },
})

const proyectarGarantia = row => ({
  id: row.id,
  titulo: row.serial || `Garantía ${row.id}`,
  subtitulo: [row.customerName, row.description].filter(Boolean).join(' · ') || 'Sin datos',
  navegar: { q: row.serial || row.customerName || '' },
})

const proyectarCompra = row => ({
  id: row.id,
  titulo: row.supplierName || `Compra ${row.id}`,
  subtitulo: [row.supplierReference, row.status === 'RECEIVED' ? 'Recibida' : 'Borrador'].filter(Boolean).join(' · '),
  navegar: { q: row.supplierName || row.supplierReference || '' },
})

const proyectarProveedor = row => ({
  id: row.id,
  titulo: row.name || `Proveedor ${row.id}`,
  subtitulo: [row.code, row.city, row.phone].filter(Boolean).join(' · ') || 'Sin datos',
  navegar: { q: row.name || row.code || '' },
})

const proyectarUnidad = row => ({
  id: row.id,
  titulo: row.serial || `Unidad ${row.id}`,
  subtitulo: [row.product?.name, row.branch?.name].filter(Boolean).join(' · ') || 'Sin datos',
  navegar: { q: row.serial || '' },
})

export default function GlobalSearch({ open, onClose, onNavigate, vistas }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState(VACIO)
  const [buscando, setBuscando] = useState(false)
  const [sinConexion, setSinConexion] = useState(false)
  const [activo, setActivo] = useState(-1)
  const inputRef = useRef(null)
  const listboxRef = useRef(null)

  const disponibles = useMemo(
    () => GRUPOS.filter(grupo => grupo.siempre || !vistas || vistas.includes(grupo.vista)),
    [vistas],
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActivo(-1)
    }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const q = query.trim()
    if (q.length < MIN_CARACTERES) {
      setResultados(VACIO)
      setBuscando(false)
      setSinConexion(false)
      setActivo(-1)
      return undefined
    }
    const controller = new AbortController()
    setBuscando(true)
    const timer = setTimeout(() => {
      // Cada grupo devuelve como máximo MAX_POR_GRUPO filas. Clientes,
      // cotizaciones, garantías, compras, proveedores y unidades filtran en el
      // servidor; productos y pedidos se traen completos y se filtran acá para
      // conservar el comportamiento previo.
      const busquedas = {
        clientes: api
          .get(`/api/customers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCliente)),
        productos: api
          .get('/api/products', { signal: controller.signal })
          .then(filas => filas
            .filter(p => incluye(p.name || p.nombre, q) || incluye(p.sku, q))
            .slice(0, MAX_POR_GRUPO)
            .map(proyectarProducto)),
        pedidos: api
          .get('/api/orders?filtro=todos', { signal: controller.signal })
          .then(filas => filas
            .filter(o => incluye(o.orderNumber || o.codigo, q) || incluye(o.customer?.name || o.cliente, q))
            .slice(0, MAX_POR_GRUPO)
            .map(proyectarPedido)),
        cotizaciones: api
          .get(`/api/quotes?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCotizacion)),
        garantias: api
          .get(`/api/warranties?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarGarantia)),
        compras: api
          .get(`/api/purchases?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCompra)),
        proveedores: api
          .get(`/api/suppliers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarProveedor)),
        unidades: api
          .get(`/api/inventory-units?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarUnidad)),
      }
      const ids = disponibles.map(grupo => grupo.id)
      Promise.allSettled(ids.map(id => busquedas[id])).then(resultados => {
        if (controller.signal.aborted) return
        const fallos = resultados.filter(r => r.status === 'rejected')
        // Un 403 es esperable si cambió el rol: el grupo queda vacío en silencio.
        fallos.forEach(r => {
          if (r.reason?.status !== 403) console.error('[GlobalSearch] una búsqueda falló:', r.reason)
        })
        setResultados(current => {
          const siguiente = { ...current }
          ids.forEach((id, indice) => {
            siguiente[id] = resultados[indice].status === 'fulfilled' ? resultados[indice].value : []
          })
          return siguiente
        })
        setSinConexion(fallos.length === ids.length)
        setBuscando(false)
      })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query, disponibles])

  const total = disponibles.reduce((suma, grupo) => suma + (resultados[grupo.id]?.length || 0), 0)
  const termino = query.trim().length >= MIN_CARACTERES

  // Lista plana para el patrón combobox: el foco queda en el input y
  // aria-activedescendant apunta a la opción resaltada.
  const opciones = useMemo(() => {
    const lista = []
    disponibles.forEach(grupo => {
      ;(resultados[grupo.id] || []).forEach(fila => {
        lista.push({ fila, grupo, indice: lista.length })
      })
    })
    return lista
  }, [disponibles, resultados])

  const indices = useMemo(
    () => new Map(opciones.map(opcion => [claveOpcion(opcion.grupo.id, opcion.fila.id), opcion.indice])),
    [opciones],
  )
  const activoClave = activo >= 0 && opciones[activo] ? claveOpcion(opciones[activo].grupo.id, opciones[activo].fila.id) : null

  useEffect(() => {
    if (activo < 0) return
    listboxRef.current?.querySelector(`#${idOpcion(activo)}`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  function elegir(opcion) {
    if (!opcion) return
    const { grupo, fila } = opcion
    onClose()
    onNavigate(grupo.vista, { ...fila.navegar, ...(grupo.subtab ? { subtab: grupo.subtab } : {}) })
  }

  function alTeclear(event) {
    if (!opciones.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActivo(actual => (actual + 1) % opciones.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActivo(actual => (actual - 1 + opciones.length) % opciones.length)
    } else if (event.key === 'Enter' && activo >= 0) {
      event.preventDefault()
      elegir(opciones[activo])
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Búsqueda global" className="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={alTeclear}
            placeholder="Buscar clientes, pedidos, cotizaciones, compras…"
            aria-label="Buscar en toda la tienda"
            role="combobox"
            aria-expanded={opciones.length > 0}
            aria-controls="global-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activo >= 0 ? idOpcion(activo) : undefined}
            className="pl-9"
          />
        </div>

        {!termino && (
          <p className="flex items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-700/40 px-4 py-3 text-sm text-mute">
            <Icon name="search" className="h-4 w-4 shrink-0 text-fono-light" />
            Escribí al menos {MIN_CARACTERES} caracteres para buscar clientes, pedidos, productos y más.
          </p>
        )}

        {buscando && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!buscando && termino && sinConexion && (
          <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            No se pudo consultar el catálogo. Revisá tu conexión y reintentá.
          </p>
        )}

        {!buscando && termino && !sinConexion && total === 0 && (
          <EmptyState
            compact
            icon="search"
            title="Sin resultados"
            description="Probá con otro nombre, SKU, serial o número."
          />
        )}

        {!buscando && (
          <div ref={listboxRef} id="global-search-listbox" role="listbox" aria-label="Resultados de búsqueda" className="space-y-4">
            {disponibles.map(grupo => {
              const filas = resultados[grupo.id] || []
              if (!filas.length) return null
              return (
                <div key={grupo.id} role="group" aria-label={grupo.titulo}>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute">
                      <Icon name={grupo.icon} className="h-3.5 w-3.5 text-fono-light" />
                      {grupo.titulo}
                    </div>
                    <Badge color="slate">{filas.length}</Badge>
                  </div>
                  <ul className="space-y-0.5">
                    {filas.map(fila => {
                      const indice = indices.get(claveOpcion(grupo.id, fila.id))
                      const seleccionada = activoClave === claveOpcion(grupo.id, fila.id)
                      return (
                        <li
                          key={claveOpcion(grupo.id, fila.id)}
                          id={idOpcion(indice)}
                          role="option"
                          aria-selected={seleccionada}
                          onMouseEnter={() => setActivo(indice)}
                          onClick={() => elegir(opciones[indice])}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${seleccionada ? 'bg-ink-700' : 'hover:bg-ink-700'}`}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-500 bg-ink-700 text-mute">
                            <Icon name={grupo.icon} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-fore">{fila.titulo}</span>
                            <span className="block truncate text-xs text-mute">{fila.subtitulo}</span>
                          </span>
                          <Icon name="chevron" className="h-4 w-4 shrink-0 text-mute" />
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}

        {!buscando && termino && total > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-600 pt-3 text-[11px] text-mute">
            <span className="flex items-center gap-1.5"><kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-semibold">↑</kbd><kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-semibold">↓</kbd> Navegar</span>
            <span className="flex items-center gap-1.5"><kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-semibold">Enter</kbd> Abrir</span>
            <span className="flex items-center gap-1.5"><kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-semibold">Esc</kbd> Cerrar</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
