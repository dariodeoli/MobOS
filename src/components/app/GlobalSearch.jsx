import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { Badge, EmptyState, Input, Modal, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'

const MAX_POR_GRUPO = 5
const MIN_CARACTERES = 2

const GRUPOS = [
  { id: 'clientes', titulo: 'Clientes', icon: 'users', vista: 'clientes' },
  { id: 'productos', titulo: 'Productos', icon: 'phone', vista: 'productos' },
  { id: 'pedidos', titulo: 'Pedidos', icon: 'box', vista: 'pedidos' },
]

const incluye = (texto, q) => String(texto || '').toLocaleLowerCase().includes(q)

const proyectarCliente = row => ({
  id: row.id,
  titulo: row.name || row.nombre || 'Cliente',
  subtitulo: [row.phone, row.document || row.email].filter(Boolean).join(' · ') || 'Sin datos',
})

const proyectarProducto = row => ({
  id: row.id,
  titulo: row.name || row.nombre || 'Producto',
  subtitulo: `SKU ${row.sku || '—'}${row.pricePyg != null && Number.isFinite(Number(row.pricePyg)) ? ` · ${gs(row.pricePyg)}` : ''}`,
})

const proyectarPedido = row => ({
  id: row.id,
  titulo: codigoPedido(row.orderNumber || row.codigo) || `Pedido ${row.id}`,
  subtitulo: row.customer?.name || row.cliente || 'Consumidor final',
})

const VACIO = { clientes: [], productos: [], pedidos: [] }

export default function GlobalSearch({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState(VACIO)
  const [buscando, setBuscando] = useState(false)
  const [sinConexion, setSinConexion] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) setQuery('')
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
      return undefined
    }
    const controller = new AbortController()
    setBuscando(true)
    const timer = setTimeout(() => {
      // Clientes: el endpoint soporta ?q=. Productos y pedidos se traen
      // completos (todos los estados) y se filtran acá.
      Promise.allSettled([
        api
          .get(`/api/customers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(filas => filas.map(proyectarCliente)),
        api
          .get('/api/products', { signal: controller.signal })
          .then(filas => filas
            .filter(p => incluye(p.name || p.nombre, q) || incluye(p.sku, q))
            .slice(0, MAX_POR_GRUPO)
            .map(proyectarProducto)),
        api
          .get('/api/orders?filtro=todos', { signal: controller.signal })
          .then(filas => filas
            .filter(o => incluye(o.orderNumber || o.codigo, q) || incluye(o.customer?.name || o.cliente, q))
            .slice(0, MAX_POR_GRUPO)
            .map(proyectarPedido)),
      ]).then(([clientes, productos, pedidos]) => {
        if (controller.signal.aborted) return
        const fallos = [clientes, productos, pedidos].filter(r => r.status === 'rejected')
        fallos.forEach(r => console.error('[GlobalSearch] una búsqueda falló:', r.reason))
        setResultados({
          clientes: clientes.status === 'fulfilled' ? clientes.value.slice(0, MAX_POR_GRUPO) : [],
          productos: productos.status === 'fulfilled' ? productos.value : [],
          pedidos: pedidos.status === 'fulfilled' ? pedidos.value : [],
        })
        setSinConexion(fallos.length === GRUPOS.length)
        setBuscando(false)
      })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query])

  const total = GRUPOS.reduce((suma, grupo) => suma + resultados[grupo.id].length, 0)
  const termino = query.trim().length >= MIN_CARACTERES

  return (
    <Modal open={open} onClose={onClose} title="Búsqueda global" className="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar clientes, productos y pedidos…"
            aria-label="Buscar en toda la tienda"
            className="pl-9"
          />
        </div>

        {!termino && (
          <p className="rounded-xl border border-fore/10 bg-fore/[.02] px-4 py-3 text-sm text-mute">
            Escribí al menos {MIN_CARACTERES} caracteres para buscar.
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
            description="Probá con otro nombre, SKU o número de pedido."
          />
        )}

        {GRUPOS.map(grupo => {
          const filas = resultados[grupo.id]
          if (!filas.length) return null
          return (
            <section key={grupo.id} aria-label={grupo.titulo}>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute">
                  <Icon name={grupo.icon} className="h-3.5 w-3.5 text-fono-light" />
                  {grupo.titulo}
                </div>
                <Badge color="slate">{filas.length}</Badge>
              </div>
              <ul className="space-y-0.5">
                {filas.map(fila => (
                  <li key={`${grupo.id}:${fila.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onNavigate(grupo.vista)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink-700"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-500 bg-ink-700 text-mute">
                        <Icon name={grupo.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fore">
                          {fila.titulo}
                        </span>
                        <span className="block truncate text-xs text-mute">{fila.subtitulo}</span>
                      </span>
                      <Icon name="chevron" className="h-4 w-4 shrink-0 text-mute" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
