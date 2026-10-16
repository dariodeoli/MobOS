import { useMemo, useState } from 'react'
import { PaletaComandos } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import { isDemoRuntime } from '@/lib/demoMode'
import { getProductos, listVentas } from '@/lib/storage'
import { listarClientesDemo } from '@/lib/demoClientes'
import { listDemoQuotes } from '@/lib/demo/cotizaciones'
import { listDemoSuppliers, listDemoUnits } from '@/lib/demoInventory'
import { loadDemoPurchases } from '@/lib/demoPurchases'
import { buscarAjustes, destinoAjuste, migasAjuste } from '@/lib/configIndice'
import { clasificarFallo, estadoBusqueda, filtrarLocal, mensajeDeEstado } from '@/lib/busquedaGlobal'

const MAX_POR_GRUPO = 5
const MIN_CARACTERES = 2

// Cada grupo declara el endpoint que consulta, el ícono del encabezado y la
// vista que abre. Los módulos de gestión solo se ofrecen si el rol los tiene
// habilitados en su navegación (`vistas`), para no llamar endpoints ajenos.
const GRUPOS = [
  { id: 'clientes', titulo: 'Clientes', icon: 'users', vista: 'clientes' },
  { id: 'productos', titulo: 'Productos', icon: 'phone', vista: 'productos' },
  { id: 'pedidos', titulo: 'Pedidos', icon: 'box', vista: 'pedidos' },
  { id: 'cotizaciones', titulo: 'Cotizaciones', icon: 'report', vista: 'cotizaciones' },
  { id: 'garantias', titulo: 'Garantías', icon: 'clock', vista: 'garantias' },
  { id: 'compras', titulo: 'Compras', icon: 'store', vista: 'compras' },
  { id: 'proveedores', titulo: 'Proveedores', icon: 'truck', vista: 'compras' },
  { id: 'unidades', titulo: 'Unidades', icon: 'package', vista: 'inventario', subtab: 'unidades' },
]

const POR_ID = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo]))
const ETIQUETAS_TIPO = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo.titulo]))
const ICONOS_TIPO = Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo.icon]))
const incluye = (texto, q) => String(texto || '').toLocaleLowerCase().includes(q)

// #303: accesos del panel que no son entidades de datos y, aun así, tienen que
// poder encontrarse por nombre desde la búsqueda («Centro de Control» se
// mencionaba en Lista por modelo y Comparador, pero no existía en la paleta).
const ACCESOS = [
  { id: 'centro-control', titulo: 'Centro de Control', detalle: 'Lista por modelo y fotos del comparador', vista: 'centro-control' },
  { id: 'celulares', titulo: 'Lista por modelo', detalle: 'Precios de nuevos y semi-nuevos', vista: 'celulares' },
  { id: 'comparador', titulo: 'Comparador', detalle: 'Modelos lado a lado con precios y fotos', vista: 'comparador' },
]
ETIQUETAS_TIPO.accesos = 'Accesos'
ICONOS_TIPO.accesos = 'search'
// #410: los ajustes de Configuración salen de su propio índice (con sinónimos y
// filtrado por rol), en un grupo propio con el camino hasta el ajuste.
ETIQUETAS_TIPO.configuracion = 'Configuración'
ICONOS_TIPO.configuracion = 'settings'

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

// #400: quien no ve el nombre real (vendedor, caja) busca y ve solo la sigla.
const proyectarInsigniaProveedor = row => ({
  id: row.id,
  titulo: row.code || 'S/S',
  subtitulo: 'Proveedor',
  navegar: { q: row.code || '' },
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

// #296 · Fuentes locales del fallback: en la demo el catálogo vive en el
// navegador y la búsqueda no depende del backend; con la API caída se usa lo
// que ya está en caché (productos y ventas en modo real; el resto es demo).
const FUENTES_LOCALES = {
  clientes: () => (isDemoRuntime ? listarClientesDemo() : []),
  productos: () => getProductos(),
  pedidos: () => listVentas(),
  cotizaciones: () => (isDemoRuntime ? listDemoQuotes() : []),
  garantias: () => [],
  compras: () => (isDemoRuntime ? loadDemoPurchases() : []),
  proveedores: () => (isDemoRuntime ? listDemoSuppliers() : []),
  unidades: () => (isDemoRuntime ? listDemoUnits('', 'active') : []),
}

const PROYECTORES = {
  clientes: proyectarCliente,
  productos: proyectarProducto,
  pedidos: proyectarPedido,
  cotizaciones: proyectarCotizacion,
  garantias: proyectarGarantia,
  compras: proyectarCompra,
  proveedores: proyectarProveedor,
  unidades: proyectarUnidad,
}

// Buscador global del panel (⌘/Ctrl + K). La paleta es de la biblioteca
// (`PaletaComandos`, docs/SHELL.md §3) y acá solo vive la consulta: cada grupo
// devuelve como máximo MAX_POR_GRUPO filas. Clientes, cotizaciones, garantías,
// compras, proveedores y unidades filtran en el servidor; productos y pedidos
// se traen completos y se filtran acá para conservar el comportamiento previo.
// El atajo lo maneja el shell (PanelVendedor), por eso `conAtajo={false}`.
export default function GlobalSearch({ open, onClose, onNavigate, vistas, esOwner = false }) {
  // La paleta (v0.62.0) muestra `mensajeError`, no el mensaje del throw: el
  // estado del último fallo se refleja en ese prop para distinguir servicio de
  // conexión. Cambiar el prop reejecuta la consulta una vez y deja el mensaje
  // correcto (el estado no vuelve a cambiar: no hay bucle).
  const [estadoError, setEstadoError] = useState('')
  const { usuario } = useSesion()
  const rol = usuario?.role
  const proveedorCompleto = ['ADMIN', 'GERENTE'].includes(rol)
  const vistasPermitidas = useMemo(() => Array.isArray(vistas) ? vistas : [], [vistas])
  const disponibles = useMemo(
    () => GRUPOS.filter(grupo => vistasPermitidas.includes(grupo.vista) && !(rol === 'VENDEDOR' && ['garantias', 'compras'].includes(grupo.id))),
    [vistasPermitidas, rol],
  )

  // Filas locales para una consulta: se proyectan y filtran igual que las del
  // API para que la paleta no distinga el origen.
  function filasLocales(q, ids) {
    const salida = []
    for (const id of ids) {
      const crudo = FUENTES_LOCALES[id]?.()
      const proyector = PROYECTORES[id]
      if (!proyector || !Array.isArray(crudo) || !crudo.length) continue
      const filas = filtrarLocal(crudo.map(proyector).filter(Boolean), q).slice(0, MAX_POR_GRUPO)
      for (const fila of filas) salida.push(filaAGrupo(id, fila))
    }
    return salida
  }

  function filaAGrupo(id, fila) {
    const grupo = POR_ID[id]
    return {
      id: `${id}:${fila.id}`,
      tipo: id,
      titulo: fila.titulo,
      detalle: fila.subtitulo,
      datos: { vista: grupo.vista, params: { ...fila.navegar, ...(grupo.subtab ? { subtab: grupo.subtab } : {}) } },
    }
  }

  async function buscar(q) {
    const ids = disponibles.map(grupo => grupo.id)
    const accesos = ACCESOS
      .filter(acceso => vistasPermitidas.includes(acceso.vista))
      .filter(acceso => incluye(acceso.titulo, q) || incluye(acceso.detalle, q))
      .map(acceso => ({
        id: `acceso:${acceso.id}`,
        tipo: 'accesos',
        titulo: acceso.titulo,
        detalle: acceso.detalle,
        datos: { vista: acceso.vista },
      }))

    const ajustes = buscarAjustes(q, { esOwner, limite: MAX_POR_GRUPO }).map(entrada => {
      const destino = destinoAjuste(entrada, { esOwner })
      return {
        id: `configuracion:${entrada.id}`,
        tipo: 'configuracion',
        titulo: entrada.label,
        detalle: migasAjuste(entrada).join(' › '),
        datos: { vista: destino.vista, params: destino.opciones },
      }
    })

    // Demo (#296): la búsqueda nunca depende del backend; el catálogo local alcanza.
    if (isDemoRuntime) return [...accesos, ...ajustes, ...filasLocales(q, ids)]

    // Factories: declarar fuentes no debe iniciar requests fuera de vistas.
    const busquedas = {
      clientes: () => api
        .get(`/api/customers?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCliente)),
      productos: () => api
        .get('/api/products')
        .then(filas => filas
          .filter(p => incluye(p.name || p.nombre, q) || incluye(p.sku, q))
          .slice(0, MAX_POR_GRUPO)
          .map(proyectarProducto)),
      pedidos: () => api
        .get('/api/orders?filtro=todos')
        .then(filas => filas
          .filter(o => incluye(o.orderNumber || o.codigo, q) || incluye(o.customer?.name || o.cliente, q))
          .slice(0, MAX_POR_GRUPO)
          .map(proyectarPedido)),
      cotizaciones: () => api
        .get(`/api/quotes?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCotizacion)),
      garantias: () => api
        .get(`/api/warranties?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarGarantia)),
      compras: () => api
        .get(`/api/purchases?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarCompra)),
      // Elegir la proyección antes de consultar: un403 no es una prueba de
      // capacidades y retira correctamente todo el contexto privado (#502).
      proveedores: () => proveedorCompleto
        ? api.get(`/api/suppliers?q=${encodeURIComponent(q)}`)
          .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarProveedor))
        : api.get('/api/suppliers/badges')
          .then(filas => filas.filter(fila => incluye(fila.code, q)).slice(0, MAX_POR_GRUPO).map(proyectarInsigniaProveedor)),
      unidades: () => api
        .get(`/api/inventory-units?q=${encodeURIComponent(q)}`)
        .then(filas => filas.slice(0, MAX_POR_GRUPO).map(proyectarUnidad)),
    }
    const settled = await Promise.allSettled(ids.map(id => busquedas[id]()))
    const fallos = []
    const resultados = [...accesos, ...ajustes]
    settled.forEach((resultado, indice) => {
      const id = ids[indice]
      if (resultado.status === 'fulfilled') {
        for (const fila of resultado.value) resultados.push(filaAGrupo(id, fila))
        return
      }
      const tipo = clasificarFallo(resultado.reason)
      if (tipo) fallos.push(tipo)
      // Un 403 es esperable si cambió el rol: el grupo queda vacío en silencio.
      else if (resultado.reason?.status !== 403) console.error(`[GlobalSearch] la búsqueda de ${id} falló:`, resultado.reason)
    })
    const estado = estadoBusqueda({ resultados, fallos })
    if (estado === 'listo' || estado === 'vacio') {
      if (estadoError) setEstadoError('')
      return resultados
    }
    // Sin respuesta del API: se usa el catálogo local antes de darse por vencido.
    const locales = filasLocales(q, ids)
    if (locales.length) {
      if (estadoError) setEstadoError('')
      return [...accesos, ...ajustes, ...locales]
    }
    setEstadoError(estado)
    throw new Error(mensajeDeEstado(estado))
  }

  return (
    <PaletaComandos
      abierta={Boolean(open)}
      onCerrar={onClose}
      conAtajo={false}
      titulo="Búsqueda global"
      ariaLabel="Buscar en toda la tienda"
      placeholder="Buscar clientes, pedidos, compras, ajustes…"
      buscar={buscar}
      onElegir={(resultado) => onNavigate(resultado.datos.vista, resultado.datos.params)}
      etiquetasTipo={ETIQUETAS_TIPO}
      iconosTipo={ICONOS_TIPO}
      minimo={MIN_CARACTERES}
      mensajeError={mensajeDeEstado(estadoError) || 'No se pudo consultar el catálogo. Revisá tu conexión y reintentá.'}
      textoSeguir={`Escribí al menos ${MIN_CARACTERES} caracteres para buscar clientes, pedidos, productos y más.`}
      descripcionVacio="Probá con otro nombre, SKU, serial o número."
      className="max-w-3xl"
    />
  )
}
