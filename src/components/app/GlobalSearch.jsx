import { useMemo } from 'react'
import { PaletaComandos } from 'owncoding-ui'
import { api } from '@/lib/api/client'
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

const POR_ID = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo]))
const ETIQUETAS_TIPO = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo.titulo]))
const ICONOS_TIPO = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo.icon]))
const incluye = (texto, q) => String(texto || '').toLocaleLowerCase().includes(q)

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

// Buscador global del panel (⌘/Ctrl + K). La paleta es de la biblioteca
// (`PaletaComandos`, docs/SHELL.md §3) y acá solo vive la consulta: cada grupo
// devuelve como máximo MAX_POR_GRUPO filas. Clientes, cotizaciones, garantías,
// compras, proveedores y unidades filtran en el servidor; productos y pedidos
// se traen completos y se filtran acá para conservar el comportamiento previo.
// El atajo lo maneja el shell (PanelVendedor), por eso `conAtajo={false}`.
export default function GlobalSearch({ open, onClose, onNavigate, vistas }) {
  const disponibles = useMemo(
    () => GRUPOS.filter(grupo => grupo.siempre || !vistas || vistas.includes(grupo.vista)),
    [vistas],
  )

  async function buscar(q) {
    const busquedas = {
      clientes: api
        .get(`/api/customers?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCliente)),
      productos: api
        .get('/api/products')
        .then(filas => filas
          .filter(p => incluye(p.name || p.nombre, q) || incluye(p.sku, q))
          .slice(0, MAX_POR_GRUPO)
          .map(proyectarProducto)),
      pedidos: api
        .get('/api/orders?filtro=todos')
        .then(filas => filas
          .filter(o => incluye(o.orderNumber || o.codigo, q) || incluye(o.customer?.name || o.cliente, q))
          .slice(0, MAX_POR_GRUPO)
          .map(proyectarPedido)),
      cotizaciones: api
        .get(`/api/quotes?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCotizacion)),
      garantias: api
        .get(`/api/warranties?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarGarantia)),
      compras: api
        .get(`/api/purchases?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCompra)),
      proveedores: api
        .get(`/api/suppliers?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarProveedor)),
      unidades: api
        .get(`/api/inventory-units?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarUnidad)),
    }
    const ids = disponibles.map(grupo => grupo.id)
    const settled = await Promise.allSettled(ids.map(id => busquedas[id]))
    settled.forEach((resultado, indice) => {
      // Un 403 es esperable si cambió el rol: el grupo queda vacío en silencio.
      if (resultado.status === 'rejected' && resultado.reason?.status !== 403) {
        console.error(`[GlobalSearch] la búsqueda de ${ids[indice]} falló:`, resultado.reason)
      }
    })
    if (settled.length > 0 && settled.every(resultado => resultado.status === 'rejected')) {
      throw new Error('No se pudo consultar el catálogo.')
    }
    const resultados = []
    ids.forEach((id, indice) => {
      if (settled[indice].status !== 'fulfilled') return
      const grupo = POR_ID[id]
      settled[indice].value.forEach(fila => resultados.push({
        id: `${id}:${fila.id}`,
        tipo: id,
        titulo: fila.titulo,
        detalle: fila.subtitulo,
        datos: { vista: grupo.vista, params: { ...fila.navegar, ...(grupo.subtab ? { subtab: grupo.subtab } : {}) } },
      }))
    })
    return resultados
  }

  return (
    <PaletaComandos
      abierta={Boolean(open)}
      onCerrar={onClose}
      conAtajo={false}
      titulo="Búsqueda global"
      ariaLabel="Buscar en toda la tienda"
      placeholder="Buscar clientes, pedidos, cotizaciones, compras…"
      buscar={buscar}
      onElegir={(resultado) => onNavigate(resultado.datos.vista, resultado.datos.params)}
      etiquetasTipo={ETIQUETAS_TIPO}
      iconosTipo={ICONOS_TIPO}
      minimo={MIN_CARACTERES}
      mensajeError="No se pudo consultar el catálogo. Revisá tu conexión y reintentá."
      textoSeguir={`Escribí al menos ${MIN_CARACTERES} caracteres para buscar clientes, pedidos, productos y más.`}
      descripcionVacio="Probá con otro nombre, SKU, serial o número."
      className="max-w-3xl"
    />
  )
}
