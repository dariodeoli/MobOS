import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { listVentas, hidratarFinanzas } from '@/lib/storage'
import { sessionApi } from '@/lib/api'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import Icon from '@/components/shared/Icon'
import AppShell from '@/components/app/AppShell'
import { ConfirmDialog, Modal, PinInput, Select, Skeleton, Subtabs, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { rutaDeVista, vistaDeRuta } from '@/lib/rutas'
import { flagsV2 } from '@/lib/flags'
import PantallaBloqueada from '@/components/app/PantallaBloqueada'
import DemoNoDisponible from '@/components/app/DemoNoDisponible'
import { usePreferencias } from '@/hooks/usePreferencias'
import ComandosAtajos from '@/components/control/ComandosAtajos'
import { usePrefetchSecciones } from '@/hooks/usePrefetchSecciones'
import { useBloqueoInactividad } from '@/hooks/useBloqueoInactividad'
import CheatSheetAtajos from '@/components/app/CheatSheetAtajos'

// Vistas pesadas en lazy: su código se descarga recién cuando se navega a ellas.
const VistaCargarVenta = lazy(() => import('@/components/ventas/VistaCargarVenta'))
const Reportes = lazy(() => import('@/components/control/Reportes'))
const Inventario = lazy(() => import('@/components/control/Inventario'))
const Compras = lazy(() => import('@/components/control/Compras'))
const Config = lazy(() => import('@/components/control/Config'))
// #253: el perfil personal (perfil, preferencias del dispositivo y sesiones
// propias) vive en su propia pantalla, accesible desde el avatar para todos
// los roles; reemplaza a la identidad que vivía dentro de Configuración.
const MiCuenta = lazy(() => import('@/components/cuenta/MiCuenta'))
const Vendedores = lazy(() => import('@/components/control/Vendedores'))
const Autorizaciones = lazy(() => import('@/components/control/Autorizaciones'))
const ServicioGarantias = lazy(() => import('@/components/control/ServicioGarantias'))
const TradeInPipeline = lazy(() => import('@/components/control/TradeInPipeline'))
const Impresoras = lazy(() => import('@/components/control/Impresoras'))
const EstadoSistema = lazy(() => import('@/components/control/EstadoSistema'))
const WhatsAppTemplates = lazy(() => import('@/components/control/WhatsAppTemplates'))
const Precios = lazy(() => import('@/components/control/Precios'))
// #247: las secciones del panel se cargan por sección (el chunk del panel baja
// fuerte); el `Suspense` que las envuelve ya existía para las que eran lazy.
const SellerCustomers = lazy(() => import('@/components/ventas/SellerCustomers'))
const SellerCatalog = lazy(() => import('@/components/ventas/SellerCatalog'))
const SellerOrders = lazy(() => import('@/components/ventas/SellerOrders'))
const StoreDelivery = lazy(() => import('@/components/delivery/StoreDelivery'))
const SellerQuotes = lazy(() => import('@/components/ventas/SellerQuotes'))
const SellerTools = lazy(() => import('@/components/ventas/SellerTools'))
const ResumenControl = lazy(() => import('@/components/control/Resumen'))
const Ganancias = lazy(() => import('@/components/control/Ganancias'))
const Gastos = lazy(() => import('@/components/control/Gastos'))
const Ads = lazy(() => import('@/components/control/Ads'))
const Ganadores = lazy(() => import('@/components/control/Ganadores'))
const Asistente = lazy(() => import('@/components/control/Asistente'))
const Historial = lazy(() => import('@/components/control/Historial'))
const Auditoria = lazy(() => import('@/components/control/Auditoria'))
const Caja = lazy(() => import('@/components/control/Caja'))
const PaymentAccounts = lazy(() => import('@/components/control/PaymentAccounts'))
const Conciliacion = lazy(() => import('@/components/control/Conciliacion'))
const Creditos = lazy(() => import('@/components/control/Creditos'))
const Cobranzas = lazy(() => import('@/components/control/Cobranzas'))
const Comisiones = lazy(() => import('@/components/control/Comisiones'))
const RolesPermisos = lazy(() => import('@/components/control/RolesPermisos'))
const Celulares = lazy(() => import('@/pages/Celulares'))
const Comparador = lazy(() => import('@/pages/Comparador'))
const Documentacion = lazy(() => import('@/components/control/Documentacion'))
// #247: la búsqueda global baja recién al abrirla (no pesa en el chunk del
// panel ni en el arranque del POS).
const GlobalSearch = lazy(() => import('@/components/app/GlobalSearch'))

// IA del menú (#251): Inicio · Vender · Clientes · Inventario · Operación ·
// Finanzas · Análisis · Configuración. El vendedor ve el mismo esqueleto con
// los módulos que su rol alcanza; Promociones y Precios viven dentro de Vender
// e Inventario (no son entradas principales) y Taller es una sola sección.
const SELLER_NAV = [
  {
    titulo: 'Vender',
    items: [
      ['cargar', 'POS', 'receipt'],
      ['pedidos', 'Mis pedidos', 'box'],
      ['cotizaciones', 'Cotizaciones', 'report'],
      ['promociones', 'Promociones', 'store'],
      ['plantillas', 'Plantillas', 'send'],
    ],
  },
  {
    titulo: 'Clientes',
    items: [['clientes', 'Clientes', 'users']],
  },
  {
    titulo: 'Inventario',
    items: [
      ['productos', 'Productos', 'phone'],
      ['precios', 'Precios', 'tag'],
    ],
  },
  {
    titulo: 'Operación',
    items: [
      ['repartos', 'Delivery', 'truck'],
      ['cotizador', 'Trade-In', 'refresh'],
      ['ayuda', 'Ayuda', 'info'],
    ],
  },
]

// El tablero real (/ops) vive fuera del panel: se ofrece como entrada solo
// cuando el rollout está activo (`VITE_OPS_V2`, ver lib/flags.js).
const { opsV2 } = flagsV2({ dev: import.meta.env.DEV, env: import.meta.env })

const OWNER_NAV = [
  {
    titulo: 'Inicio',
    items: [['resumen', 'Inicio', 'chart']],
  },
  {
    titulo: 'Vender',
    items: [
      ['cargar', 'POS', 'receipt'],
      ['pedidos', 'Pedidos', 'box'],
      ['cotizaciones', 'Cotizaciones', 'report'],
      ['promociones', 'Promociones', 'store'],
      ['plantillas', 'Plantillas', 'send'],
    ],
  },
  {
    titulo: 'Clientes',
    items: [['clientes', 'Clientes', 'users']],
  },
  {
    titulo: 'Inventario',
    items: [
      ['productos', 'Productos', 'phone'],
      ['unidades', 'Unidades', 'box'],
      ['compras', 'Compras', 'store'],
      ['traslados', 'Traslados y tránsito', 'truck'],
      ['precios', 'Precios', 'tag'],
      ['celulares', 'Lista por modelo', 'tag'],
      ['comparador', 'Comparador', 'report'],
    ],
  },
  {
    titulo: 'Operación',
    items: [
      ['repartos', 'Delivery', 'truck'],
      ['servicio', 'Taller y garantías', 'wrench'],
      ['tradein-admin', 'Trade-In', 'refresh'],
      ['autorizaciones', 'Autorizaciones', 'check'],
      ...(opsV2 ? [['ops', 'Tablero de operaciones', 'chart']] : []),
    ],
  },
  {
    titulo: 'Finanzas',
    items: [['finanzas', 'Finanzas', 'receipt']],
  },
  {
    titulo: 'Análisis',
    items: [['analisis', 'Análisis', 'report']],
  },
  {
    titulo: 'Configuración',
    items: [['equipo', 'Configuración', 'settings'], ['ayuda', 'Ayuda', 'info']],
  },
]

// Taller: el técnico entra directo a las órdenes de servicio.
const TECNICO_NAV = [
  {
    titulo: 'Operación',
    items: [['servicio', 'Taller y garantías', 'wrench']],
  },
]

// Accesos directos de la barra inferior en móvil/tablet.
const SELLER_BOTTOM = [
  ['cargar', 'Vender', 'receipt'],
  ['pedidos', 'Pedidos', 'box'],
  ['repartos', 'Delivery', 'truck'],
  ['clientes', 'Clientes', 'users'],
  ['productos', 'Productos', 'phone'],
  ['cotizaciones', 'Cotizaciones', 'report'],
]

const OWNER_BOTTOM = [
  ['resumen', 'Inicio', 'chart'],
  ['cargar', 'Vender', 'receipt'],
  ['pedidos', 'Pedidos', 'box'],
  ['inventario', 'Inventario', 'box'],
]

// Cada apartado con pestañas vive en /<padre>/<slug> (slug hijo en la URL).

const TABS_ANALISIS = [
  ['reportes', 'Reportes'],
  ['ganancias', 'Ganancias'],
  ['ganadores', 'Ganadores'],
  ['asistente', 'Asistente'],
]
const TABS_FINANZAS = [
  ['caja', 'Caja'],
  ['gastos', 'Gastos'],
  ['bancos', 'Bancos y cuentas'],
  ['conciliacion', 'Conciliación'],
  ['creditos', 'Créditos'],
  ['cuotas', 'Cuotas'],
  ['comisiones', 'Comisiones'],
  ['publicidad', 'Publicidad'],
]
const TABS_INVENTARIO = [
  ['unidades', 'Unidades'],
  ['taller', 'Taller'],
  ['conteos', 'Conteos'],
  ['alertas', 'Alertas'],
  ['reservas', 'Reservas'],
  ['traslados', 'Traslados'],
  ['vendidos', 'Vendidos'],
  ['transito', 'En tránsito'],
  ['ubicaciones', 'Ubicaciones'],
  ['compartido', 'Compartido'],
  ['eliminados', 'Eliminados'],
]
const SUBPAGINAS = {
  configuracion: {
    // `vista` es el id de navegación que habilita el acceso (OWNER_NAV);
    // la pestaña por defecto sigue siendo la primera del listado (mi-cuenta).
    vista: 'equipo',
    tabs: [
      // IA (#251): siete secciones, sin duplicar. Los slugs viejos
      // redirigen a su sección nueva (REDIRECCIONES_CONFIG).
      ['mi-cuenta', 'Mi cuenta'],
      ['organizacion', 'Organización'],
      ['equipo', 'Equipo y acceso'],
      ['comercial', 'Comercial'],
      ['seguridad', 'Seguridad y auditoría'],
      ['dispositivos', 'Dispositivos'],
      ['sistema', 'Sistema'],
    ],
  },
  // Ayuda vive fuera de Configuración: se entra desde el shell (Documentación).
  ayuda: { vista: 'ayuda', tabs: [['ayuda', 'Ayuda']] },
  analisis: { vista: 'analisis', tabs: TABS_ANALISIS },
  finanzas: { vista: 'finanzas', tabs: TABS_FINANZAS },
  inventario: { vista: 'inventario', tabs: TABS_INVENTARIO },
}
// El id del menú y el slug de la pestaña apuntan a la misma subpágina.
const SUBPAGINA_DE_VISTA = Object.fromEntries(
  Object.entries(SUBPAGINAS).map(([slug, cfg]) => [cfg.vista, slug]),
)
// Migas del topbar: la subpágina es el camino; la pestaña activa va como título.
const MIGA_SUBPAGINA = {
  inventario: 'Inventario',
  analisis: 'Análisis',
  finanzas: 'Finanzas',
  configuracion: 'Configuración',
  ayuda: 'Ayuda',
}
// Pestañas visibles según el modo: créditos y cuotas solo fuera de la demo.
function tabsDeSubpagina(slug, esDemo) {
  const tabs = SUBPAGINAS[slug]?.tabs || []
  // Finanzas oculta créditos/cuotas/comisiones en demo (necesitan el API real);
  // Estado del sistema se muestra con su aviso de "no disponible" (#201).
  if (slug === 'finanzas') return tabs.filter(([id]) => ((id === 'creditos' || id === 'cuotas' || id === 'comisiones') ? !esDemo : true))
  return tabs
}

// Configuración en siete secciones (#IA): los slugs viejos siguen funcionando
// y redirigen a la sección nueva; Documentación sale del panel y vive en Ayuda.
const REDIRECCIONES_CONFIG = {
  // El perfil personal (foto y nombre) vive en su propia pantalla, accesible
  // desde el avatar: la ruta vieja de Configuración cae ahí (#253).
  identidad: '/mi-perfil',
  preferencias: '/configuracion/mi-cuenta',
  negocio: '/configuracion/organizacion',
  sucursales: '/configuracion/organizacion',
  roles: '/configuracion/equipo',
  precios: '/configuracion/comercial',
  historial: '/configuracion/seguridad',
  impresion: '/configuracion/dispositivos',
  impresoras: '/configuracion/dispositivos',
  documentacion: '/ayuda/ayuda',
}

const SUBPAGINA_DE_TAB = Object.fromEntries(
  Object.entries(SUBPAGINAS).flatMap(([slug, cfg]) => cfg.tabs.map(([id]) => [id, slug])),
)

const LABELS = {
  clientes: 'Clientes',
  pedidos: 'Mis pedidos',
  repartos: 'Delivery',
  productos: 'Productos',
  promociones: 'Promociones',
  precios: 'Precios',
  'mi-perfil': 'Mi perfil',
  cotizaciones: 'Cotizaciones',
  plantillas: 'Plantillas de WhatsApp',
  cotizador: 'Trade-In',
  cargar: 'POS',
  resumen: 'Inicio',
  ops: 'Tablero de operaciones',
  analisis: 'Análisis',
  finanzas: 'Finanzas',
  equipo: 'Configuración',
  'mi-cuenta': 'Mi cuenta',
  organizacion: 'Organización',
  comercial: 'Comercial',
  seguridad: 'Seguridad y auditoría',
  dispositivos: 'Dispositivos',
  sistema: 'Estado del sistema',
  reportes: 'Reportes',
  ganancias: 'Ganancias',
  ganadores: 'Ganadores',
  asistente: 'Asistente',
  caja: 'Caja',
  celulares: 'Lista por modelo',
  comparador: 'Comparador',
  gastos: 'Gastos',
  bancos: 'Bancos y cuentas',
  conciliacion: 'Conciliación',
  creditos: 'Créditos',
  cuotas: 'Cuotas',
  publicidad: 'Publicidad',
  comisiones: 'Comisiones',
  unidades: 'Unidades',
  alertas: 'Alertas',
  reservas: 'Reservas',
  traslados: 'Traslados',
  vendidos: 'Vendidos',
  transito: 'En tránsito',
  ubicaciones: 'Ubicaciones',
  compartido: 'Compartido',
  eliminados: 'Eliminados',
  garantias: 'Taller',
  autorizaciones: 'Autorizaciones',
  inventario: 'Inventario',
  compras: 'Compras',
  'tradein-admin': 'Trade-In',
  servicio: 'Taller',
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Marca de pantalla bloqueada: en sessionStorage para que el bloqueo no se
// pierda al recargar y se descarte al cerrar la pestaña (#204).
const LOCK_FLAG_KEY = 'mobos:pos-bloqueado'
function marcarBloqueo(activo) {
  try {
    if (activo) sessionStorage.setItem(LOCK_FLAG_KEY, '1')
    else sessionStorage.removeItem(LOCK_FLAG_KEY)
  } catch { /* sin storage: el bloqueo sigue en memoria */ }
}

// Mientras una vista pesada descarga su código, la pantalla no queda vacía.
function VistaCargando() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const desfaseHoras = useReloj()
  const {
    sesion,
    usuario,
    vendedores,
    cambiarVendedor,
    entrarDemo,
    esDemo,
    salir,
    empresa,
    perfilEmpresa,
    sucursal,
  } = useSesion()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { seccion: routeSeccion } = useParams()
  // Las subpáginas con pestañas viven en /<padre>/<hijo>: el primer tramo de la
  // URL es el padre y el slug hijo define la pestaña activa.
  const slugRuta = pathname.split('/')[1] || ''
  const subpadre = SUBPAGINAS[slugRuta] ? slugRuta : null
  const tabsRuta = useMemo(() => (subpadre ? tabsDeSubpagina(subpadre, esDemo) : []), [subpadre, esDemo])
  const seccionRuta = subpadre && tabsRuta.some(([id]) => id === routeSeccion) ? routeSeccion : null
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const esTecnico = !esOwner && (usuario?.role === 'TECNICO' || sesion?.rol === 'TECNICO')
  // #247: adelanta los chunks de las secciones más usadas cuando el equipo está
  // ocioso (una sola vez por carga y solo si la conexión lo permite).
  usePrefetchSecciones(esOwner ? 'dueno' : esTecnico ? 'tecnico' : 'vendedor')
  // El slug plano de la URL define la vista (/pos, /pedidos, /trade-in…).
  const routeVista = subpadre ? null : vistaDeRuta(slugRuta, { esOwner })
  const [vista, setVista] = useState(seccionRuta || routeVista || (subpadre ? tabsRuta[0][0] : 'cargar'))
  const tabsConfig = tabsRuta
  // En las subpáginas el título es la pestaña activa (la sección va en la miga).
  const tituloVista = subpadre
    ? (tabsRuta.find(([id]) => id === vista) || [null, LABELS[vista] || MIGA_SUBPAGINA[subpadre]])[1]
    : LABELS[vista]
  const [tradeIn, setTradeIn] = useState(null)
  const identidad = `${usuario?.tenantId}:${usuario?.branchId}:${sesion?.vendedorId}:${usuario?.role}:${esDemo}`
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [pin, setPin] = useState('')
  const [cambiando, setCambiando] = useState(false)
  // Menú lateral plegado: último usado como predeterminado (#209).
  const [sidebarCollapsed, recordarSidebar] = useUltimoUsado('shell:menu-plegado', false)
  const [locked, setLocked] = useState(() => {
    // El bloqueo sobrevive a la recarga (#204): sin esto, F5 lo saltaba.
    try { return sessionStorage.getItem(LOCK_FLAG_KEY) === '1' } catch { return false }
  })
  const [lockPin, setLockPin] = useState('')
  const [lockError, setLockError] = useState('')
  const [lockBusy, setLockBusy] = useState(false)
  const [salirAbierto, setSalirAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [ayudaAbierto, setAyudaAbierto] = useState(false)
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)
  // #247: el POS se monta la primera vez que se entra (después queda oculto
  // para no perder la venta en curso). Antes se montaba siempre y arrastraba
  // combos, cuentas de cobro y su chunk a todas las pantallas.
  const [posMontado, setPosMontado] = useState(vista === 'cargar')
  const cambioEnCurso = useRef(false)
  const lockEnCurso = useRef(false)
  const toast = useToast()

  // Ids visibles en el menú según el rol: deciden qué ítem resalta cuando la
  // vista es una pestaña de sección a la que se entra desde el menú (#251).
  const idsDelMenu = useMemo(() => {
    const nav = esOwner ? OWNER_NAV : esTecnico ? TECNICO_NAV : SELLER_NAV
    return new Set(nav.flatMap(group => group.items.map(([id]) => id)))
  }, [esOwner, esTecnico])
  const accesibles = useMemo(() => {
    const base = (esOwner ? OWNER_NAV : esTecnico ? TECNICO_NAV : SELLER_NAV).flatMap(group => group.items).map(([id]) => id)
    // Tres vistas no son ítems del menú pero su ruta tiene que ser válida:
    // 'inventario' (la sección; sus ítems de menú son sus pestañas y las
    // pantallas de catálogo), 'garantias' (pestaña de «Taller» desde #224:
    // los enlaces viejos siguen abriendo la sección) y 'mi-perfil' (#253: el
    // perfil personal se abre desde el avatar, para todos los roles).
    return esOwner ? [...base, 'inventario', 'garantias', 'mi-perfil'] : [...base, 'mi-perfil']
  }, [esOwner, esTecnico])
  // Un slug plano de pestaña (p. ej. /precios, que también es pestaña de
  // Configuración) se canoniza a /<padre>/<hijo> cuando el rol la tiene.
  useEffect(() => {
    if (subpadre) return
    const destino = SUBPAGINA_DE_VISTA[routeVista] || SUBPAGINA_DE_TAB[routeVista]
    if (!destino || !accesibles.includes(SUBPAGINAS[destino].vista)) return
    const primera = tabsDeSubpagina(destino, esDemo)[0][0]
    navigate(`/${destino}/${SUBPAGINA_DE_TAB[routeVista] ? routeVista : primera}`, { replace: true })
  }, [subpadre, routeVista, accesibles, esDemo, navigate])
  // #247: las finanzas se hidratan al entrar a su pantalla, a análisis o al
  // resumen (usan los mismos gastos/publicidad) y quedan en los refrescos.
  useEffect(() => {
    if (esOwner && (vista === 'resumen' || subpadre === 'finanzas' || subpadre === 'analisis')) hidratarFinanzas()
  }, [esOwner, vista, subpadre, identidad])
  // Las URLs viejas de Configuración entran por su sección nueva (#IA):
  // /configuracion/negocio → organizacion, /configuracion/documentacion →
  // /ayuda/ayuda, etc.
  // #247: el POS entra al árbol en cuanto se visita; después no se desmonta.
  useEffect(() => {
    if (vista === 'cargar' && !posMontado) setPosMontado(true)
  }, [vista, posMontado])
  useEffect(() => {
    if (subpadre !== 'configuracion' || !routeSeccion) return
    const destino = REDIRECCIONES_CONFIG[routeSeccion]
    if (destino) navigate(destino, { replace: true })
  }, [subpadre, routeSeccion, navigate])
  // Apartado sin hijo (o con uno desconocido) entra por su primera pestaña.
  // Los slugs viejos con redirección propia no pasan por acá: su destino puede
  // salir del apartado (p. ej. /configuracion/documentacion → /ayuda/ayuda) y
  // este efecto los devolvería a la primera pestaña.
  useEffect(() => {
    if (!subpadre || seccionRuta || REDIRECCIONES_CONFIG[routeSeccion]) return
    navigate(`/${subpadre}/${tabsRuta[0][0]}`, { replace: true })
  }, [subpadre, seccionRuta, tabsRuta, routeSeccion, navigate])
  // El repartidor tiene su propio panel (/delivery/repartos): el panel de venta
  // no es su lugar y el backend tampoco lo autoriza a vender.
  useEffect(() => {
    if (!esDemo && usuario?.role === 'REPARTIDOR') navigate('/delivery/repartos', { replace: true })
  }, [esDemo, usuario?.role, navigate])
  // Si la URL apunta a una vista fuera del alcance del rol (ej. un técnico en
  // el POS o un vendedor en /inventario), se redirige a su primera vista
  // accesible de una sola vez. Sin el navigate acá, los dos efectos se pisan en
  // bucle: uno fuerza la vista y el otro vuelve a leer la URL.
  useEffect(() => {
    const requerido = subpadre ? SUBPAGINAS[subpadre].vista : vista
    if (!accesibles.includes(requerido)) {
      const primera = accesibles[0] || 'cargar'
      setVista(primera)
      navigate(rutaDeVista(primera) || '/pos', { replace: true })
    }
  }, [subpadre, accesibles, vista, navigate])
  // Sincroniza la URL → vista solo para rutas válidas del rol activo.
  useEffect(() => {
    if (subpadre) {
      if (seccionRuta && seccionRuta !== vista) setVista(seccionRuta)
      return
    }
    if (routeVista && SUBPAGINA_DE_VISTA[routeVista]) {
      const primera = tabsDeSubpagina(SUBPAGINA_DE_VISTA[routeVista], esDemo)[0][0]
      if (vista !== primera) setVista(primera)
      return
    }
    if (routeVista && routeVista !== vista && accesibles.includes(routeVista)) setVista(routeVista)
  }, [subpadre, seccionRuta, routeVista, vista, accesibles, esDemo])

  // `opciones` permite que la búsqueda global abra el destino con el filtro
  // aplicado (q), la ficha del cliente o el detalle del pedido.
  function ir(id, opciones = {}) {
    // El tablero real (/ops) vive fuera del panel, con su propio shell: se
    // entra con una navegación completa, igual que abriendo la URL directa.
    if (id === 'ops') { window.location.assign('/ops'); return }
    // Un ítem del menú puede ser una pestaña de una sección (p. ej. «Unidades»
    // dentro de Inventario, #251): se abre la sección en esa pestaña. Ojo: las
    // vistas de sección (inventario, equipo, finanzas, análisis) también son
    // pestañas de su propia sección, así que no se resuelven acá.
    const seccionDelTab = SUBPAGINA_DE_TAB[id]
    if (seccionDelTab && !SUBPAGINA_DE_VISTA[id]) return ir(SUBPAGINAS[seccionDelTab].vista, { ...opciones, subtab: id })
    // Fuera del alcance del rol se va a la primera vista que sí puede abrir,
    // no siempre a "cargar" (un técnico no vende: su lugar es el taller).
    if (!esOwner && !accesibles.includes(id)) {
      const primera = accesibles[0] || 'cargar'
      setVista(primera)
      navigate(rutaDeVista(primera) || '/pos', { replace: true })
      return
    }
    const consulta = []
    if (opciones.q) consulta.push(`q=${encodeURIComponent(opciones.q)}`)
    if (opciones.clienteId) consulta.push(`cliente=${encodeURIComponent(opciones.clienteId)}`)
    const sufijo = consulta.length ? `?${consulta.join('&')}` : ''
    const destino = SUBPAGINA_DE_VISTA[id]
    if (destino) {
      const tabs = tabsDeSubpagina(destino, esDemo)
      const primera = opciones.subtab && tabs.some(([key]) => key === opciones.subtab) ? opciones.subtab : tabs[0][0]
      setVista(primera)
      navigate(`/${destino}/${primera}${sufijo}`)
      return
    }
    if (id === 'pedidos' && opciones.orderId) {
      setVista('pedidos')
      navigate(`/pedidos/${encodeURIComponent(opciones.orderId)}`)
      return
    }
    setVista(id)
    navigate(`${rutaDeVista(id) || '/pos'}${sufijo}`)
  }

  // Pestaña de un subpadre: la pestaña activa vive en la URL hija.
  function irASubtab(id) {
    setVista(id)
    if (subpadre) navigate(`/${subpadre}/${id}`)
  }

  function toggleSidebar() {
    recordarSidebar(current => !current)
  }

  const hoy = fechaClave()
  const delDia = esOwner ? ventasDelDia(listVentas(), hoy) : []
  const totalHoy = delDia.reduce((a, v) => a + num(v.precio), 0)
  const activos = new Set(delDia.map(v => v.vendedorId).filter(Boolean)).size
  const [, m, dd] = hoy.split('-')
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const diaSem = DIAS[new Date(`${hoy}T12:00:00`).getDay()]
  const fechaLarga = `${diaSem}, ${Number(dd)} de ${MESES[Number(m) - 1]}`
  const opcionesVendedor = vendedores?.length
    ? vendedores
    : [{ id: sesion?.vendedorId, name: sesion?.nombre }]

  function abrirCambio() {
    setSellerId(sesion?.vendedorId || opcionesVendedor[0]?.id || '')
    setPin('')
    setCambiarAbierto(true)
  }

  function pedirBloqueo() {
    setLockPin('')
    setLockError('')
    setLockBusy(false)
    setLocked(true)
    marcarBloqueo(true)
  }

  // Preferencias del dispositivo: los minutos de bloqueo mandan sobre el
  // temporizador de inactividad (10 por defecto).
  const [preferencias, cambiarPreferencias] = usePreferencias(usuario?.id)
  const pinLength = esDemo ? 4 : (usuario?.pinLength || 4)
  const pinLengthCambio = esDemo
    ? 4
    : (opcionesVendedor.find(seller => seller.id === sellerId)?.pinLength || 4)
  useBloqueoInactividad({
    minutos: preferencias.bloqueoMinutos,
    activo: !locked && Boolean(sesion?.vendedorId),
    onBloquear: pedirBloqueo,
  })

  const intentarDesbloqueo = useCallback(
    async pinIntento => {
      if (lockEnCurso.current) return
      lockEnCurso.current = true
      setLockBusy(true)
      setLockError('')
      try {
        if (esDemo) {
          const esperado = esOwner ? '3001' : '2001'
          if (pinIntento !== esperado) throw new Error('PIN inválido. Probá de nuevo.')
        } else {
          await sessionApi.loginSeller({ sellerId: sesion?.vendedorId, pin: pinIntento })
        }
        setLocked(false)
        setLockPin('')
        marcarBloqueo(false)
        try { navigator.vibrate?.(40) } catch { /* sin soporte de vibración */ }
      } catch (err) {
        setLockError(err?.message || 'PIN inválido. Probá de nuevo.')
        setLockPin('')
      } finally {
        lockEnCurso.current = false
        setLockBusy(false)
      }
    },
    [esDemo, esOwner, sesion?.vendedorId],
  )

  useEffect(() => {
    if (locked && lockPin.length === pinLength) intentarDesbloqueo(lockPin)
  }, [locked, lockPin, pinLength, intentarDesbloqueo])

  async function confirmarSalir() {
    setSaliendo(true)
    marcarBloqueo(false)
    try {
      await salir()
    } finally {
      setSaliendo(false)
    }
  }

  const irRef = useRef(ir)
  irRef.current = ir
  const abrirBusquedaRef = useRef(() => {})
  abrirBusquedaRef.current = () => setBusquedaAbierta(true)
  const atajosCtx = useRef({})
  atajosCtx.current = { locked, cambiarAbierto, ayudaAbierto, salirAbierto, esOwner, vista, busquedaAbierta }
  useEffect(() => {
    function onKey(event) {
      const {
        locked: bloqueado,
        cambiarAbierto: cambio,
        ayudaAbierto: ayuda,
        salirAbierto: saliendo2,
        esOwner: owner,
        vista: vistaActual,
        busquedaAbierta: buscando,
      } = atajosCtx.current
      if (bloqueado) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          return
      }
      if (cambio || ayuda || saliendo2 || buscando) return
      // En la vista de carga, F2 y F3 pertenecen al formulario de venta
      // (buscar producto / agregar al carrito); el panel solo los usa para
      // navegar cuando la vista activa es otra.
      const enCarga = vistaActual === 'cargar'
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        abrirBusquedaRef.current()
      } else if (event.key === 'F1') {
        event.preventDefault()
        irRef.current('cargar')
      } else if (event.key === 'F2') {
        if (enCarga) return
        event.preventDefault()
        irRef.current('productos')
        window.__mobosFocusSearch = true
        window.dispatchEvent(new CustomEvent('mobos:focus-search'))
      } else if (event.key === 'F3') {
        if (enCarga) return
        event.preventDefault()
        irRef.current('clientes')
        window.__mobosNewCustomer = true
        window.dispatchEvent(new CustomEvent('mobos:new-customer'))
      } else if (event.key === 'F4') {
        event.preventDefault()
        const navActual = owner ? OWNER_NAV : SELLER_NAV
        const accesibles = navActual.flatMap(group => group.items).map(([id]) => id)
        if (accesibles.includes('cotizador')) irRef.current('cotizador')
        else toast.info('Atajo F4', 'La vista de Trade-In no está disponible en esta sesión.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast])

  useEffect(() => {
    if (!cambiarAbierto || pin.length !== pinLengthCambio || !sellerId || cambioEnCurso.current) return
    cambioEnCurso.current = true
    setCambiando(true)
    if (esDemo && !['2001', '3001'].includes(pin)) {
      toast.error('PIN demo inválido.')
      setPin('')
      setCambiando(false)
      cambioEnCurso.current = false
      return
    }
    const cambio = esDemo
      ? entrarDemo(pin === '3001' ? 'ADMIN' : 'VENDEDOR')
      : cambiarVendedor({ sellerId, pin })
    cambio
      .then(() => {
        setCambiarAbierto(false)
        // Si veníamos de la pantalla bloqueada, cambiar de usuario también la cierra.
        setLocked(false)
        marcarBloqueo(false)
        toast.success('Sesión cambiada', 'La próxima venta se registrará con este vendedor.')
        if (esDemo && pin === '3001') navigate('/')
      })
      .catch(err => {
        toast.error(err?.message || 'PIN inválido. Probá de nuevo.')
        setPin('')
      })
      .finally(() => {
        cambioEnCurso.current = false
        setCambiando(false)
      })
  }, [pin, sellerId, pinLengthCambio, cambiarAbierto, esDemo, cambiarVendedor, entrarDemo, navigate, toast])

  return (
    <>
      <AppShell
        title={tituloVista}
        breadcrumb={subpadre ? [MIGA_SUBPAGINA[subpadre]] : undefined}
        nav={esOwner ? OWNER_NAV : esTecnico ? TECNICO_NAV : SELLER_NAV}
        bottomNav={esOwner ? OWNER_BOTTOM : esTecnico ? [] : SELLER_BOTTOM}
        onOpenMenuLabel="Menú"
        active={subpadre ? (idsDelMenu.has(vista) ? vista : SUBPAGINAS[subpadre].vista) : vista}
        onNavigate={ir}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        empresa={empresa}
        esDemo={esDemo}
        sesionNombre={sesion?.nombre}
        esOwner={esOwner}
        usuario={usuario}
        perfilEmpresa={perfilEmpresa}
        onSwitchUser={abrirCambio}
        onLogout={() => setSalirAbierto(true)}
        onLockRequest={pedirBloqueo}
        onPerfil={() => ir('mi-perfil')}
        menuAcciones
        onAbrirNotificacion={(href) => navigate(href)}
        onSearch={() => setBusquedaAbierta(true)}
        onHelp={() => setAyudaAbierto(true)}
        sidebarStats={
          esOwner && (
            <>
              <div className="mt-1 text-[22px] font-semibold tracking-tight text-fono-light tabular-nums">
                {gs(totalHoy)}
              </div>
              <div className="mt-1 text-[11.5px] text-fore/60">
                {delDia.length} ventas · {activos} {activos === 1 ? 'vendedor' : 'vendedores'}
              </div>
            </>
          )
        }
        headerActions={
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <SelectorSucursal className="max-sm:max-w-[7.5rem]" />
            <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute xl:flex">
              <Icon name="calendar" className="h-[15px] w-[15px]" />
              <span className="whitespace-nowrap">{fechaLarga}</span>
            </div>
            {vista !== 'cargar' && accesibles.includes('cargar') && (
              <button
                type="button"
                onClick={() => {
                  setVista('cargar')
                  navigate('/pos')
                }}
                className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-onbrand transition hover:bg-fono-dark"
                title="POS"
                aria-label="POS"
              >
                <Icon name="plus" className="h-[15px] w-[15px]" />
                <span className="hidden sm:inline">POS</span>
              </button>
            )}
          </div>
        }
      >
        {desfaseHoras > 0 && (
          <div className="flex items-center justify-center gap-2 bg-bad px-4 py-2.5 text-center text-sm font-medium">
            <Icon name="alert" className="h-4 w-4" />
            La fecha de este equipo está desfasada ~{desfaseHoras} h. Corregila antes de cargar
            ventas.
          </div>
        )}

        <main className="flex-1 bg-gradient-to-b from-paper to-paper p-4 md:p-8">
          <Suspense fallback={<VistaCargando />}>
          {posMontado && (
          <div key={`venta:${identidad}`} hidden={vista !== 'cargar'}>
            {tradeIn?.identidad === identidad && (
              <div
                role="status"
                className="mx-auto mb-5 max-w-4xl space-y-2 rounded-2xl border border-fono/30 bg-fono/10 p-4"
              >
                <p className="font-semibold">
                  Canje acordado: {tradeIn.model} · {gs(tradeIn.value)}
                </p>
                <p>IMEI / serial: {tradeIn.imei}</p>
                <p className="text-sm text-mute">
                  Preparando el canje como parte de pago. El equipo ingresará a la pipeline al
                  confirmar la venta.
                </p>
                <button className="text-sm underline" onClick={() => setTradeIn(null)}>
                  Descartar ficha
                </button>
              </div>
            )}
            <VistaCargarVenta
              tradeInDraft={tradeIn?.identidad === identidad ? tradeIn : null}
              onTradeInConsumed={() => setTradeIn(null)}
            />
          </div>
          )}

          <div key={identidad}>
            {vista === 'clientes' && <SellerCustomers />}
            {vista === 'productos' && <SellerCatalog />}
            {vista === 'pedidos' && <SellerOrders />}
            {vista === 'repartos' && <StoreDelivery />}
            {vista === 'promociones' && <SellerTools vista="promociones" />}
            {vista === 'cotizaciones' && <SellerQuotes />}
            <div hidden={vista !== 'cotizador'}>
              <SellerTools
                vista="cotizador"
                onCargarVenta={draft => {
                  setTradeIn({ ...draft, id: crypto.randomUUID(), identidad })
                  setVista('cargar')
                  navigate('/pos')
                }}
              />
            </div>
          </div>

          {esOwner && subpadre === 'inventario' && <Inventario tab={vista} onTabChange={irASubtab} />}
          {(esOwner && (vista === 'compras' || vista === 'productos')) && <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{[['compras', 'Compras'], ['productos', 'Productos']].map(([id, label]) => <button key={id} type="button" aria-pressed={vista === id} onClick={() => ir(id)} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', vista === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>}
          {vista === 'plantillas' && <WhatsAppTemplates />}
          {esOwner && vista === 'celulares' && <Celulares />}
          {esOwner && vista === 'comparador' && <Comparador />}
          {esOwner && vista === 'compras' && <Compras />}
          {esOwner && vista === 'tradein-admin' && <TradeInPipeline />}
          {(esOwner || esTecnico) && (vista === 'servicio' || vista === 'garantias') && <ServicioGarantias vistaInicial={vista} />}
          {esOwner && vista === 'autorizaciones' && <Autorizaciones />}
          {esOwner && vista === 'resumen' && <ResumenControl />}
          {esOwner && subpadre === 'analisis' && (
            <div>
              <Subtabs value={vista} onChange={irASubtab} items={tabsRuta} />
              {vista === 'reportes' && <Reportes />}
              {vista === 'ganancias' && <Ganancias />}
              {vista === 'ganadores' && <Ganadores />}
              {vista === 'asistente' && <Asistente />}
            </div>
          )}
          {esOwner && subpadre === 'finanzas' && (
            <div>
              {/* #249 H3: en mobile las solapas del dominio llegan a 44 px
                  táctiles (el alto por defecto del objeto compartido queda
                  para DSN); en desktop conservan los 36 px. */}
              <Subtabs value={vista} onChange={irASubtab} items={tabsRuta} className="[&>button]:min-h-11 md:[&>button]:min-h-9" />
              {vista === 'caja' && <Caja />}
              {vista === 'gastos' && <Gastos />}
              {vista === 'bancos' && <PaymentAccounts />}
              {vista === 'conciliacion' && <Conciliacion />}
              {vista === 'creditos' && <Creditos />}
              {vista === 'cuotas' && <Cobranzas />}
              {vista === 'comisiones' && <Comisiones />}
              {vista === 'publicidad' && <Ads />}
            </div>
          )}
          {vista === 'precios' && <Precios />}
          {esOwner && subpadre === 'configuracion' && (
            <div className="space-y-3">
              <Subtabs
                value={vista}
                onChange={irASubtab}
                items={tabsConfig}
              />
              {vista === 'mi-cuenta' && <MiCuenta preferencias={preferencias} onCambiarPreferencias={cambiarPreferencias} />}
              {vista === 'organizacion' && <Config seccion="organizacion" />}
              {vista === 'equipo' && (
                <div className="space-y-3">
                  <Vendedores />
                  <Config seccion="equipo" />
                  <RolesPermisos />
                </div>
              )}
              {vista === 'comercial' && (
                <div className="space-y-3">
                  {/* #253: las listas de precios viven en Inventario → Precios
                      (única entrada visible); Comercial no las duplica. */}
                  <Config seccion="comercial" />
                </div>
              )}
              {vista === 'seguridad' && (esDemo ? (
                <div className="space-y-3">
                  <DemoNoDisponible modulo="Seguridad de la cuenta" motivo="Administra contraseñas, sesiones y acciones sensibles de tu tienda real." />
                  <Historial />
                </div>
              ) : (
                <div className="space-y-3">
                  <Config seccion="seguridad" />
                  <Auditoria />
                </div>
              ))}
              {vista === 'dispositivos' && <Impresoras />}
              {vista === 'sistema' && (esDemo
                ? <DemoNoDisponible modulo="Estado del sistema" motivo="Consulta los servicios reales de MobOS (API, base e impresión)." />
                : <EstadoSistema />)}
            </div>
          )}
          {vista === 'mi-perfil' && (
            <MiCuenta preferencias={preferencias} onCambiarPreferencias={cambiarPreferencias} />
          )}
          {subpadre === 'ayuda' && (
            <div className="space-y-3">
              {vista === 'ayuda' && (
                <>
                  <ComandosAtajos />
                  <Documentacion />
                </>
              )}
            </div>
          )}
          </Suspense>
        </main>
      </AppShell>

      <Modal
        open={cambiarAbierto}
        onClose={() => !cambiando && setCambiarAbierto(false)}
        title="Cambiar vendedor" size="corto">
        <p className="mt-2 text-sm text-mute">
          Elegí quién registra la próxima venta y confirmá su PIN.
        </p>
        <label htmlFor="seller-switch" className="mt-6 block text-sm font-semibold">
          Vendedor
        </label>
        <Select
          id="seller-switch"
          value={sellerId}
          onChange={event => setSellerId(event.target.value)}
          disabled={cambiando}
          className="mt-2 w-full"
        >
          {opcionesVendedor.map(seller => (
            <option key={seller.id} value={seller.id}>
              {seller.name || seller.nombre || seller.email}
            </option>
          ))}
        </Select>
        {esDemo ? (
          <>
            <p className="mt-4 rounded-xl border border-fono-dark/20 bg-fono-dark/5 p-3 text-xs text-mute">
              PIN demo vendedor: <strong className="text-fore">2001</strong> · dueño:{' '}
              <strong className="text-fore">3001</strong>
            </p>
            <label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">
              PIN demo
            </label>
            <PinInput
              id="seller-switch-pin"
              autoFocus
              length={pinLengthCambio}
              value={pin}
              onChange={next => setPin(next)}
              className="mt-2 disabled:opacity-50"
            />{' '}
          </>
        ) : (
          <>
            <label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">
              PIN del vendedor
            </label>
            <PinInput
              id="seller-switch-pin"
              autoFocus
              length={pinLengthCambio}
              value={pin}
              onChange={next => setPin(next)}
              className="mt-2 disabled:opacity-50"
            />{' '}
          </>
        )}
        <p className="mt-5 text-xs text-mute">Esc para cerrar · tocar afuera también cierra</p>
      </Modal>

      <PantallaBloqueada
        abierto={locked && !cambiarAbierto && !salirAbierto}
        empresa={empresa?.nombre}
        sucursal={sucursal?.nombre}
        usuario={{ id: usuario?.id, name: usuario?.user_metadata?.nombre || sesion?.nombre, hasAvatar: usuario?.hasAvatar }}
        picture={esOwner ? perfilEmpresa?.picture : undefined}
        pinLength={pinLength}
        pin={lockPin}
        onPinChange={setLockPin}
        busy={lockBusy}
        error={lockError}
        esDemo={esDemo}
        onCambiarUsuario={() => {
          setCambiarAbierto(true)
          setSellerId(sesion?.vendedorId || '')
          setPin('')
        }}
        onSalir={() => setSalirAbierto(true)}
      />

      <Modal
        open={ayudaAbierto}
        onClose={() => setAyudaAbierto(false)}
        title="Atajos de teclado" size="corto">
        <p className="mt-4 text-xs text-mute">
          Los atajos no funcionan mientras escribís en un campo o tenés un diálogo abierto.
        </p>
        <CheatSheetAtajos />
        <Link
          to="/ayuda/ayuda"
          onClick={() => setAyudaAbierto(false)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fono-light hover:underline"
        >
          Ver todos los comandos y atajos en Ayuda
          <Icon name="external" className="h-3.5 w-3.5" />
        </Link>
      </Modal>

      <ConfirmDialog
        open={salirAbierto}
        onCancel={() => setSalirAbierto(false)}
        onConfirm={confirmarSalir}
        title="¿Cerrar sesión?"
        description="Vas a salir de la sesión actual. Las ventas sin confirmar no se pierden, pero tendrás que volver a ingresar para seguir operando."
        confirmLabel="Salir"
        variant="danger"
        busy={saliendo}
      />

      {busquedaAbierta && (
        <Suspense fallback={null}>
          <GlobalSearch
            open
            onClose={() => setBusquedaAbierta(false)}
            onNavigate={ir}
            vistas={accesibles}
          />
        </Suspense>
      )}
    </>
  )
}
