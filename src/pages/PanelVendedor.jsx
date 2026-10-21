import { crearControlIntentosPin } from '@/lib/nativo/intentosPin'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { hidratarFinanzas, refrescarCatalogo } from '@/lib/storage'
import { sessionApi } from '@/lib/api'
import { api } from '@/lib/api/client'
import { EQUIPO_DEMO } from '@/lib/demo/iphones'
import { ROLE_LABELS } from '@/lib/roles'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import AppShell from '@/components/app/AppShell'
import VistaErrorBoundary from '@/components/app/VistaErrorBoundary'
import { ConfirmDialog, Modal, Select, Skeleton, useToast } from '@/components/ui'
import { rutaDeVista, vistaDeRuta } from '@/lib/rutas'
import { flagsV2 } from '@/lib/flags'
import PantallaBloqueada from '@/components/app/PantallaBloqueada'
import PinSegmentado from '@/components/shared/PinSegmentado'
import { vibrar } from '@/lib/nativo/haptics'
import { isNativeIOS, moduloDisponible } from '@/lib/plataforma'
import ProximamenteIOS from '@/components/nativo/ProximamenteIOS'
import { alPasarASegundoPlano, marcarPinVigente, pinVigente } from '@/lib/nativo/bloqueo'
import { faceIdAlAbrir, tipoBiometria, verificarBiometria } from '@/lib/nativo/biometria'
import DemoNoDisponible from '@/components/app/DemoNoDisponible'
import { usePreferencias } from '@/hooks/usePreferencias'
import ComandosAtajos from '@/components/control/ComandosAtajos'
import { usePrefetchSecciones } from '@/hooks/usePrefetchSecciones'
import { useBloqueoInactividad } from '@/hooks/useBloqueoInactividad'
import CheatSheetAtajos from '@/components/app/CheatSheetAtajos'
import NavegacionConfig from '@/components/control/config/NavegacionConfig'
import MenuConfiguracion from '@/components/control/config/MenuConfiguracion'
import ResaltarAjuste from '@/components/control/config/ResaltarAjuste'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { destinoAjuste } from '@/lib/configIndice'
import { grupoShellDeTab } from '@/components/stock/stockHelpers'

// Vistas pesadas en lazy: su código se descarga recién cuando se navega a ellas.
const VistaCargarVenta = lazy(() => import('@/components/ventas/VistaCargarVenta'))
const Reportes = lazy(() => import('@/components/control/Reportes'))
const AnalyticsPos = lazy(() => import('@/components/ventas/AnalyticsPos'))
const Inventario = lazy(() => import('@/components/control/Inventario'))
const Compras = lazy(() => import('@/components/control/Compras'))
const Config = lazy(() => import('@/components/control/Config'))
const MiCuenta = lazy(() => import('@/components/cuenta/MiCuenta'))
const Equipo = lazy(() => import('@/components/control/Equipo'))
const Ops = lazy(() => import('@/pages/Ops'))
const Autorizaciones = lazy(() => import('@/components/control/Autorizaciones'))
const ServicioGarantias = lazy(() => import('@/components/control/ServicioGarantias'))
const TradeInPipeline = lazy(() => import('@/components/control/TradeInPipeline'))
const Impresoras = lazy(() => import('@/components/control/Impresoras'))
const EstadoSistema = lazy(() => import('@/components/control/EstadoSistema'))
const McpConexiones = lazy(() => import('@/components/control/config/McpConexiones'))
const WhatsAppTemplates = lazy(() => import('@/components/control/WhatsAppTemplates'))
const Precios = lazy(() => import('@/components/control/Precios'))
const CentroControl = lazy(() => import('@/components/control/CentroControl'))
const PorComprar = lazy(() => import('@/components/supply/PorComprar'))
const ComprasCentro = lazy(() => import('@/components/supply/ComprasCentro'))
const PrepararCompra = lazy(() => import('@/components/supply/PrepararCompra'))
const PrepararLote = lazy(() => import('@/components/supply/PrepararLote'))
const Recepcion = lazy(() => import('@/components/supply/Recepcion'))
const MetricasAbastecimiento = lazy(() => import('@/components/supply/MetricasAbastecimiento'))
// #247: las secciones del panel se cargan por sección (el chunk del panel baja
// fuerte); el `Suspense` que las envuelve ya existía para las que eran lazy.
const SellerCustomers = lazy(() => import('@/components/ventas/SellerCustomers'))
const CampanasVista = lazy(() => import('@/components/ventas/SellerCustomers').then(m => ({ default: m.CampanasVista })))
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
      ['cargar', 'Nueva venta', 'receipt'],
      ['pedidos', 'Mis pedidos', 'box'],
      ['cotizaciones', 'Cotizaciones', 'report'],
      ['promociones', 'Promociones', 'store'],
      ['plantillas', 'Plantillas', 'send'],
    ],
  },
  {
    titulo: 'Clientes',
    items: [
      ['clientes', 'Clientes', 'users'],
      ['campanas', 'Campañas', 'send'],
    ],
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

// El tablero real (/ops) se muestra dentro del panel (mismo shell): se ofrece
// como entrada solo cuando el rollout está activo (`VITE_OPS_V2`, ver lib/flags.js).
const { opsV2 } = flagsV2({ dev: import.meta.env.DEV, env: import.meta.env })

const OWNER_NAV = [
  {
    titulo: 'Inicio',
    items: [['resumen', 'Inicio', 'chart']],
  },
  {
    titulo: 'Vender',
    items: [
      ['cargar', 'Nueva venta', 'receipt'],
      ['pedidos', 'Pedidos', 'box'],
      ['cotizaciones', 'Cotizaciones', 'report'],
      ['promociones', 'Promociones', 'store'],
      ['plantillas', 'Plantillas', 'send'],
    ],
  },
  {
    titulo: 'Clientes',
    items: [
      ['clientes', 'Clientes', 'users'],
      ['campanas', 'Campañas', 'send'],
    ],
  },
  {
    titulo: 'Inventario',
    items: [
      // #332: las dos vistas del inventario, emparejadas y evidentes: las
      // unidades físicas por IMEI/serial y el catálogo normal por stock. La
      // navegación entre vistas vive en las pestañas del shell; en móvil el
      // menú ofrece las dos entradas.
      ['unidades', 'Unidades (IMEI)', 'box'],
      ['productos', 'Productos (stock)', 'phone'],
      ['compras', 'Compras', 'store'],
      ['traslados', 'Traslados y tránsito', 'truck'],
      ['abastecimiento', 'Por comprar', 'box'],
      ['compras-centro', 'Compras del Centro', 'store'],
      ['preparacion', 'Preparar compra', 'tag'],
      ['lotes', 'Preparar lote', 'tag'],
      ['recepcion', 'Recepción', 'truck'],
      ['metricas', 'Métricas de abastecimiento', 'chart'],
      ['precios', 'Precios', 'tag'],
      ['celulares', 'Lista por modelo', 'tag'],
      ['comparador', 'Comparador', 'report'],
      // #303: administra la lista por modelo y las fotos del comparador.
      ['centro-control', 'Centro de Control', 'settings'],
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

// Cada apartado con pestañas vive en /<padre>/<slug> (slug hijo en la URL).

const TABS_ANALISIS = [
  ['reportes', 'Reportes'],
  ['ventas-dia', 'Ventas del día'],
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
  ['verificacion', 'Verificación'],
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
    // la pestaña por defecto es la primera del listado (organizacion).
    vista: 'equipo',
    tabs: [
      // IA (#251): siete secciones, sin duplicar, ordenadas por frecuencia de
      // uso (negocio y equipo primero, la cuenta personal al final: se abre
      // también desde el perfil). Los slugs viejos redirigen a su sección
      // nueva (REDIRECCIONES_CONFIG).
      ['organizacion', 'Organización'],
      ['equipo', 'Equipo y acceso'],
      ['dispositivos', 'Impresoras'],
      ['comercial', 'Comercial'],
      ['seguridad', 'Seguridad'],
      ['sistema', 'Sistema'],
      ['mi-cuenta', 'Mi cuenta'],
    ],
  },
  // Ayuda vive fuera de Configuración: se entra desde el shell (Documentación).
  ayuda: { vista: 'ayuda', tabs: [['ayuda', 'Ayuda']] },
  analisis: { vista: 'analisis', tabs: TABS_ANALISIS },
  finanzas: { vista: 'finanzas', tabs: TABS_FINANZAS },
  // Stock absorbió Inventario: la subpágina vive en /stock/<pestaña>; el id de
  // vista (y su permiso) sigue siendo 'inventario'.
  stock: { vista: 'inventario', tabs: TABS_INVENTARIO },
}
// El id del menú y el slug de la pestaña apuntan a la misma subpágina.
const SUBPAGINA_DE_VISTA = Object.fromEntries(
  Object.entries(SUBPAGINAS).map(([slug, cfg]) => [cfg.vista, slug]),
)
// Migas del topbar: la subpágina es el camino; la pestaña activa va como título.
const MIGA_SUBPAGINA = {
  stock: 'Stock',
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
  // La ruta vieja de identidad cae en Mi cuenta, la superficie personal (#253).
  identidad: '/configuracion/mi-cuenta',
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

// Vistas de precios/pagos: la app nunca enlaza a su versión web.
const SIN_ENLACE_WEB = ['precios', 'celulares', 'comparador', 'centro-control', 'creditos', 'finanzas', 'cuotas', 'comisiones']

const LABELS = {
  clientes: 'Clientes',
  campanas: 'Campañas',
  pedidos: 'Mis pedidos',
  repartos: 'Delivery',
  productos: 'Productos',
  promociones: 'Promociones',
  precios: 'Precios',
  abastecimiento: 'Por comprar',
  'compras-centro': 'Compras del Centro',
  preparacion: 'Preparar compra',
  lotes: 'Preparar lote',
  recepcion: 'Recepción',
  metricas: 'Métricas de abastecimiento',
  cotizaciones: 'Cotizaciones',
  plantillas: 'Plantillas de WhatsApp',
  cotizador: 'Trade-In',
  cargar: 'Vender',
  resumen: 'Inicio',
  ops: 'Tablero de operaciones',
  analisis: 'Análisis',
  finanzas: 'Finanzas',
  equipo: 'Configuración',
  'mi-cuenta': 'Mi cuenta',
  organizacion: 'Organización',
  comercial: 'Comercial',
  seguridad: 'Seguridad',
  dispositivos: 'Impresoras',
  sistema: 'Estado del sistema',
  reportes: 'Reportes',
  'ventas-dia': 'Ventas del día',
  ganancias: 'Ganancias',
  ganadores: 'Ganadores',
  asistente: 'Asistente',
  caja: 'Caja',
  celulares: 'Lista por modelo',
  comparador: 'Comparador',
  'centro-control': 'Centro de Control',
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
  const { pathname, search: busquedaUrl } = useLocation()
  const angosta = usePantallaAngosta()
  // Dónde estaba el usuario antes de entrar a Configuración, para «‹ Configuración».
  const rutaPrevia = useRef('')
  const { seccion: routeSeccion } = useParams()
  // Las subpáginas con pestañas viven en /<padre>/<hijo>: el primer tramo de la
  // URL es el padre y el slug hijo define la pestaña activa.
  const slugRuta = pathname.split('/')[1] || ''
  const subpadre = SUBPAGINAS[slugRuta] ? slugRuta : null
  const tabsRuta = useMemo(() => (subpadre ? tabsDeSubpagina(subpadre, esDemo) : []), [subpadre, esDemo])
  const seccionRuta = subpadre && tabsRuta.some(([id]) => id === routeSeccion) ? routeSeccion : null
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [moduleStore, setModuleStore] = useState(null)
  const [moduleStoreResolved, setModuleStoreResolved] = useState(false)
  useEffect(() => {
    if (esDemo || !sesion) { setModuleStore(null); setModuleStoreResolved(true); return }
    let active = true
    setModuleStoreResolved(false)
    api.get('/api/tenant/modules').then(result => {
      if (active) { setModuleStore(result); setModuleStoreResolved(true) }
    }).catch(() => {
      if (active) { setModuleStore(null); setModuleStoreResolved(true) }
    })
    const actualizar = event => setModuleStore(current => current ? { ...current, state: event.detail } : current)
    window.addEventListener('mobos:module-store-updated', actualizar)
    return () => { active = false; window.removeEventListener('mobos:module-store-updated', actualizar) }
  }, [esDemo, sesion, empresa?.id])
  const esTecnico = !esOwner && (usuario?.role === 'TECNICO' || sesion?.rol === 'TECNICO')
  // #247: adelanta los chunks de las secciones más usadas cuando el equipo está
  // ocioso (una sola vez por carga y solo si la conexión lo permite).
  usePrefetchSecciones(esOwner ? 'dueno' : esTecnico ? 'tecnico' : 'vendedor')
  // El slug plano de la URL define la vista (/pos, /pedidos, /trade-in…).
  const routeVista = subpadre ? null : vistaDeRuta(slugRuta, { esOwner })
  const [vista, setVista] = useState(seccionRuta || routeVista || (subpadre ? tabsRuta[0][0] : 'cargar'))
  const tabsConfig = tabsRuta
  // En las subpáginas el título es la pestaña activa (la sección va en la miga).
  // Stock: la pestaña del shell (Unidades · Traslados · Control) es el título.
  const tituloVista = subpadre === 'stock'
    ? grupoShellDeTab(vista).label
    : subpadre
      ? (tabsRuta.find(([id]) => id === vista) || [null, LABELS[vista] || MIGA_SUBPAGINA[subpadre]])[1]
      : LABELS[vista]
  const listaConfigMovil = subpadre === 'configuracion' && angosta && !seccionRuta
  const tituloPantalla = listaConfigMovil ? MIGA_SUBPAGINA.configuracion : tituloVista
  useEffect(() => {
    if (slugRuta !== 'configuracion') rutaPrevia.current = `${pathname}${busquedaUrl}`
  }, [slugRuta, pathname, busquedaUrl])
  function salirDeConfiguracion() {
    const destino = rutaPrevia.current
    if (destino && !destino.startsWith('/configuracion')) navigate(destino)
    else ir('resumen')
  }
  const [tradeIn, setTradeIn] = useState(null)
  const identidad = `${usuario?.tenantId}:${usuario?.branchId}:${sesion?.vendedorId}:${usuario?.role}:${esDemo}`
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [pin, setPin] = useState('')
  const [cambioPinInvalido, setCambioPinInvalido] = useState(false)
  const [cambiando, setCambiando] = useState(false)
  // Menú lateral plegado: último usado como predeterminado (#209).
  const [sidebarCollapsed, recordarSidebar] = useUltimoUsado('shell:menu-plegado', false)
  const [locked, setLocked] = useState(() => {
    // El bloqueo sobrevive a la recarga (#204): sin esto, F5 lo saltaba.
    // App de iPhone: arranque en frío = PIN siempre (equipos compartidos).
    if (isNativeIOS() && !esDemo && !pinVigente()) return true
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
  const controlPin = useRef(null)
  if (!controlPin.current) controlPin.current = crearControlIntentosPin()
  const toast = useToast()

  // Ids visibles en el menú según el rol: deciden qué ítem resalta cuando la
  // vista es una pestaña de sección a la que se entra desde el menú (#251).
  // Campañas de recompra: solo administración/gerencia y solo con datos reales.
  const puedeCampanas = !esDemo && ['ADMIN', 'GERENTE'].includes(usuario?.role)
  const navActual = useMemo(() => {
    const base = esOwner ? OWNER_NAV : esTecnico ? TECNICO_NAV : SELLER_NAV
    // App de iPhone v1: solo Vender, Pedidos, Clientes y Configuración.
    const modulesByNavId = new Map()
    for (const module of moduleStore?.catalog || []) for (const id of module.navIds) modulesByNavId.set(id, [...(modulesByNavId.get(id) || []), module.id])
    const moduleEnabled = (id) => {
      // Mensajes también se resuelve antes de que el catálogo termine de cargar:
      // para usuarios autenticados, el estado desconocido no habilita estas rutas.
      if (id === 'plantillas' || id === 'campanas') {
        if (esDemo) return true
        return moduleStore?.state?.modules?.mensajes?.enabled === true
      }
      const moduleIds = modulesByNavId.get(id) || []
      return moduleIds.every(moduleId => moduleStore?.state?.modules?.[moduleId]?.enabled !== false)
    }
    return base
      .map(group => ({ ...group, items: group.items.filter(([id]) => (puedeCampanas || id !== 'campanas') && moduloDisponible(id) && moduleEnabled(id)) }))
      .filter(group => group.items.length)
  }, [esOwner, esTecnico, puedeCampanas, moduleStore, esDemo])
  const vistaRequerida = subpadre ? SUBPAGINAS[subpadre].vista : vista
  const proximamenteIOS = !moduloDisponible(vistaRequerida)
  const idsDelMenu = useMemo(() => new Set(navActual.flatMap(group => group.items.map(([id]) => id))), [navActual])
  const accesibles = useMemo(() => {
    const base = navActual.flatMap(group => group.items).map(([id]) => id)
    // Tres vistas no son ítems del menú pero su ruta tiene que ser válida:
    // 'inventario' (la sección; sus ítems de menú son sus pestañas y las
    // pantallas de catálogo) y 'garantias' (pestaña de «Taller» desde #224:
    // los enlaces viejos siguen abriendo la sección). 'mi-cuenta' (#253) es
    // personal: cualquier rol entra a su perfil desde el avatar.
    const modules = moduleStore?.state?.modules || {}
    // Una ruta de Mensajes abierta directamente no debe redirigirse durante
    // la carga del estado. La navegación visual sigue oculta y, al resolver,
    // el estado desactivado o no disponible bloquea la ruta como siempre.
    const pendingMessagesRoutes = !esDemo && !moduleStoreResolved ? ['plantillas', 'campanas'] : []
    const accesosPropietario = ['inventario', 'garantias', 'mi-cuenta'].filter(id => {
      const moduleId = id === 'inventario' ? 'inventario' : id === 'garantias' ? 'servicios' : null
      return !moduleId || modules[moduleId]?.enabled !== false
    })
    return esOwner ? [...base, ...accesosPropietario, ...pendingMessagesRoutes] : [...base, 'mi-cuenta', ...pendingMessagesRoutes]
  }, [esOwner, navActual, moduleStore, moduleStoreResolved, esDemo])
  // Un slug plano de pestaña (p. ej. /precios, que también es pestaña de
  // Configuración) se canoniza a /<padre>/<hijo> cuando el rol la tiene.
  useEffect(() => {
    if (subpadre) return
    const destino = SUBPAGINA_DE_VISTA[routeVista] || SUBPAGINA_DE_TAB[routeVista]
    if (!destino || !accesibles.includes(SUBPAGINAS[destino].vista)) return
    const primera = tabsDeSubpagina(destino, esDemo)[0][0]
    navigate(`/${destino}/${SUBPAGINA_DE_TAB[routeVista] ? routeVista : primera}${busquedaUrl}`, { replace: true })
  }, [subpadre, routeVista, accesibles, esDemo, navigate, busquedaUrl])
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
  // #257: el catálogo del POS sale del espejo local. Al entrar al POS se
  // refresca (solo productos) para que las unidades cargadas en Inventario u
  // otra pantalla sean visibles/vendibles sin recargar ni esperar al periódico.
  useEffect(() => {
    if (vista === 'cargar') refrescarCatalogo({ forzar: true }).catch(() => {})
  }, [vista, identidad])
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
    // Celular: /configuracion es la lista de secciones, no entra a la primera.
    if (subpadre === 'configuracion' && angosta && !routeSeccion) return
    navigate(`/${subpadre}/${tabsRuta[0][0]}`, { replace: true })
  }, [subpadre, seccionRuta, tabsRuta, routeSeccion, navigate, angosta])
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
  // App de iPhone: el inicio no existe; la app abre directo en Vender.
  useEffect(() => {
    if (!subpadre && vista === 'resumen' && !moduloDisponible('resumen')) navigate('/pos', { replace: true })
  }, [subpadre, vista, navigate])
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
    // Mi cuenta (#253): el dueño la ve como pestaña de Configuración (su lugar
    // en la IA de siete grupos); el resto del equipo entra a la vista personal
    // /mi-cuenta, que no pide permisos de administración.
    if (id === 'mi-cuenta' && !esOwner) {
      setVista('mi-cuenta')
      navigate(opciones.ajuste ? `/mi-cuenta?ajuste=${encodeURIComponent(opciones.ajuste)}` : '/mi-cuenta')
      return
    }
    // «Control» (Stock) es una pestaña del shell que abre su primera vista.
    if (id === 'control') return ir('inventario', { ...opciones, subtab: 'conteos' })
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
    if (opciones.ajuste) consulta.push(`ajuste=${encodeURIComponent(opciones.ajuste)}`)
    const sufijo = consulta.length ? `?${consulta.join('&')}` : ''
    const destino = SUBPAGINA_DE_VISTA[id]
    if (destino) {
      const tabs = tabsDeSubpagina(destino, esDemo)
      const primera = opciones.subtab && tabs.some(([key]) => key === opciones.subtab) ? opciones.subtab : tabs[0][0]
      setVista(primera)
      // Celular (#410): entrar a Configuración abre la lista de secciones.
      if (destino === 'configuracion' && angosta && !opciones.subtab) {
        navigate('/configuracion')
        return
      }
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
    // La Tienda de módulos es una entrada prioritaria del encabezado, pero su
    // contenido sigue perteneciendo a Organización para conservar permisos y
    // no duplicar la pantalla existente. El query permite deep links y estado
    // activo sin agregar una octava sección al catálogo histórico.
    if (id === 'modulos' && subpadre === 'configuracion') {
      setVista('organizacion')
      navigate('/configuracion/organizacion?org=modulos')
      return
    }
    setVista(id)
    if (subpadre) navigate(`/${subpadre}/${id}`)
  }

  const modulosActivos = subpadre === 'configuracion' && vista === 'organizacion' && new URLSearchParams(busquedaUrl).get('org') === 'modulos'

  function toggleSidebar() {
    recordarSidebar(current => !current)
  }

  const opcionesVendedor = useMemo(
    () => (esDemo
      ? EQUIPO_DEMO
      : (vendedores?.length ? vendedores : [{ id: sesion?.vendedorId, name: sesion?.nombre }])),
    [esDemo, vendedores, sesion?.vendedorId, sesion?.nombre],
  )

  function pedirBloqueo() {
    controlPin.current.invalidar()
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
    async (pinIntento) => {
      await controlPin.current.ejecutar(async signal => {
        if (esDemo) {
          const esperado = usuario?.pin || (esOwner ? '3001' : '2001')
          if (pinIntento !== esperado) throw new Error('PIN inválido. Probá de nuevo.')
        } else {
          await sessionApi.unlockSeller(pinIntento, usuario, { signal })
        }
      }, {
        alIniciar: () => { setLockBusy(true); setLockError('') },
        alConfirmar: () => {
          setLocked(false); setLockPin(''); marcarBloqueo(false)
          vibrar('exito'); marcarPinVigente(true)
        },
        alFallar: err => { setLockError(err?.message || 'PIN inválido. Probá de nuevo.'); setLockPin('') },
        alTerminar: () => setLockBusy(false),
      })
    },
    [esDemo, esOwner, usuario],
  )

  // Face ID opcional (Configuración, solo dueño/admin): se pide ANTES del PIN,
  // nunca en su lugar. Con el respaldo del código del iPhone que da el sistema.
  const [faceIdPendiente, setFaceIdPendiente] = useState(false)
  const faceIdIntentado = useRef(false)
  const pedirFaceId = useCallback(async () => {
    if (await verificarBiometria('Abrí MobOS')) setFaceIdPendiente(false)
  }, [])
  useEffect(() => {
    if (!locked || !isNativeIOS() || esDemo || !faceIdAlAbrir()) { faceIdIntentado.current = false; setFaceIdPendiente(false); return undefined }
    if (faceIdIntentado.current) return undefined
    faceIdIntentado.current = true
    let vivo = true
    tipoBiometria().then((tipo) => { if (vivo && tipo) { setFaceIdPendiente(true); pedirFaceId() } })
    return () => { vivo = false }
  }, [locked, esDemo, pedirFaceId])

  useEffect(() => {
    const control = controlPin.current
    control.invalidar(); setLockBusy(false); setLockPin(''); setLockError('')
    return () => control.invalidar()
  }, [identidad])

  // App de iPhone: al pasar a segundo plano se bloquea; al volver pide el PIN.
  useEffect(() => {
    if (!isNativeIOS() || esDemo || !sesion?.vendedorId) return undefined
    let quitar = () => {}
    let vivo = true
    alPasarASegundoPlano(() => { marcarPinVigente(false); pedirBloqueo() }).then((fn) => { if (vivo) quitar = fn; else fn() })
    return () => { vivo = false; quitar() }
  }, [esDemo, sesion?.vendedorId])

  useEffect(() => {
    if (locked && lockPin.length === pinLength) intentarDesbloqueo(lockPin)
  }, [locked, lockPin, pinLength, intentarDesbloqueo])

  async function confirmarSalir() {
    controlPin.current.invalidar()
    setSaliendo(true)
    marcarBloqueo(false)
    try {
      marcarPinVigente(false)
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
    const elegido = opcionesVendedor.find(seller => String(seller.id) === String(sellerId)) || null
    if (esDemo && (!elegido?.pin || pin !== elegido.pin)) {
      toast.error('PIN demo inválido.', elegido ? `Usá el PIN de ${elegido.nombre || elegido.name} (el de su tarjeta en /demo).` : undefined)
      setPin('')
      setCambioPinInvalido(true)
      setCambiando(false)
      cambioEnCurso.current = false
      return
    }
    const cambio = esDemo
      ? entrarDemo(elegido)
      : cambiarVendedor({ sellerId, pin })
    cambio
      .then(() => {
        setCambiarAbierto(false)
        // Si veníamos de la pantalla bloqueada, cambiar de usuario también la cierra.
        setLocked(false)
        marcarBloqueo(false)
        toast.success('Sesión cambiada', 'La próxima venta se registrará con este vendedor.')
        if (esDemo) {
          const destino = elegido?.rol === 'ADMIN' ? '/'
            : elegido?.rol === 'TECNICO' ? '/servicio'
              : elegido?.rol === 'REPARTIDOR' ? '/delivery/repartos'
                : '/pos'
          navigate(destino)
        }
      })
      .catch(err => {
        toast.error(err?.message || 'PIN inválido. Probá de nuevo.')
        setPin('')
        setCambioPinInvalido(true)
      })
      .finally(() => {
        cambioEnCurso.current = false
        setCambiando(false)
      })
  }, [pin, sellerId, pinLengthCambio, cambiarAbierto, esDemo, cambiarVendedor, entrarDemo, navigate, toast, opcionesVendedor])

  return (
    <>
      <AppShell
        title={tituloPantalla}
        breadcrumb={subpadre ? [MIGA_SUBPAGINA[subpadre]] : undefined}
        backTo={esOwner && subpadre === 'configuracion' && angosta && seccionRuta ? () => navigate('/configuracion') : undefined}
        configMenu={
          esOwner && subpadre === 'configuracion' ? (
            <MenuConfiguracion
              items={tabsConfig}
              value={vista}
              onChange={irASubtab}
              onModules={irASubtab}
              modulesActive={modulosActivos}
              onBack={salirDeConfiguracion}
              onElegirAjuste={entrada => {
                const { vista: destinoVista, opciones } = destinoAjuste(entrada, { esOwner })
                ir(destinoVista, opciones)
              }}
              empresa={empresa}
              esOwner={esOwner}
            />
          ) : undefined
        }
        nav={navActual}
        active={subpadre === 'stock' ? grupoShellDeTab(vista).id : subpadre ? (idsDelMenu.has(vista) ? vista : SUBPAGINAS[subpadre].vista) : vista}
        onNavigate={ir}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        empresa={empresa}
        esDemo={esDemo}
        sesionNombre={sesion?.nombre}
        esOwner={esOwner}
        roleLabel={ROLE_LABELS[usuario?.role] || 'Vendedor'}
        usuario={usuario}
        perfilEmpresa={perfilEmpresa}
        onMiCuenta={() => ir('mi-cuenta')}
        onLogout={() => setSalirAbierto(true)}
        onLockRequest={pedirBloqueo}
        notificacionesActivas
        onAbrirNotificacion={(href) => navigate(href)}
        onSearch={() => setBusquedaAbierta(true)}
        onHelp={() => setAyudaAbierto(true)}
        pageTabs={
          esOwner && (subpadre === 'finanzas' || subpadre === 'analisis')
            ? {
                items: tabsRuta,
                value: vista,
                onChange: irASubtab,
                label: `Secciones de ${MIGA_SUBPAGINA[subpadre]}`,
              }
            : undefined
        }
      >
        {desfaseHoras > 0 && (
          <div className="flex items-center justify-center gap-2 bg-bad px-4 py-2.5 text-center text-sm font-medium">
            <Icon name="alert" className="h-4 w-4" />
            La fecha de este equipo está desfasada ~{desfaseHoras} h. Corregila antes de cargar
            ventas.
          </div>
        )}

        <main className="flex-1 bg-gradient-to-b from-paper to-paper px-4 pb-4 pt-1 md:px-6 md:pb-8 lg:pt-0">
          <VistaErrorBoundary resetKey={vista}>
          <Suspense fallback={<VistaCargando />}>
          {proximamenteIOS ? <ProximamenteIOS nombre={LABELS[vistaRequerida] || MIGA_SUBPAGINA[subpadre]} urlWeb={SIN_ENLACE_WEB.includes(vistaRequerida) || SIN_ENLACE_WEB.includes(vista) ? '' : `https://moboss.online${window.location.pathname}`} /> : (<>
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
              activo={vista === 'cargar'}
              onBloquear={pedirBloqueo}
              onIr={ir}
            />
          </div>
          )}

          <div key={identidad}>
            {vista === 'clientes' && <SellerCustomers />}
            {vista === 'campanas' && <CampanasVista />}
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

          {esOwner && subpadre === 'stock' && <Inventario tab={vista} onTabChange={irASubtab} />}
          {vista === 'plantillas' && <WhatsAppTemplates />}
          {!subpadre && vista === 'mi-cuenta' && <MiCuenta preferencias={preferencias} onCambiarPreferencias={cambiarPreferencias} />}
          {esOwner && vista === 'celulares' && <Celulares />}
          {esOwner && vista === 'comparador' && <Comparador />}
          {esOwner && vista === 'centro-control' && <CentroControl />}
          {esOwner && vista === 'compras' && <Compras />}
          {esOwner && vista === 'tradein-admin' && <TradeInPipeline />}
          {(esOwner || esTecnico) && (vista === 'servicio' || vista === 'garantias') && <ServicioGarantias vistaInicial={vista} />}
          {esOwner && vista === 'autorizaciones' && <Autorizaciones />}
          {esOwner && opsV2 && vista === 'ops' && <Ops embebido />}
          {esOwner && vista === 'resumen' && <ResumenControl />}
          {esOwner && subpadre === 'analisis' && (
            <div>
              {vista === 'reportes' && <Reportes />}
              {vista === 'ventas-dia' && <AnalyticsPos inline />}
              {vista === 'ganancias' && <Ganancias />}
              {vista === 'ganadores' && <Ganadores />}
              {vista === 'asistente' && <Asistente />}
            </div>
          )}
          {esOwner && subpadre === 'finanzas' && (
            <div>
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
          {esOwner && vista === 'abastecimiento' && <PorComprar />}
          {esOwner && vista === 'compras-centro' && <ComprasCentro />}
          {esOwner && vista === 'preparacion' && <PrepararCompra />}
          {esOwner && vista === 'lotes' && <PrepararLote />}
          {esOwner && vista === 'recepcion' && <Recepcion />}
          {/* F6 (#250): rendimiento de proveedores, tiempos de tránsito y atrasos. */}
          {esOwner && vista === 'metricas' && <MetricasAbastecimiento />}
          {esOwner && subpadre === 'configuracion' && (
            <NavegacionConfig value={vista} onChange={irASubtab} items={tabsConfig} onModules={irASubtab} modulesActive={modulosActivos} seccionAbierta={!angosta || Boolean(seccionRuta)}>
              {vista === 'mi-cuenta' && <MiCuenta preferencias={preferencias} onCambiarPreferencias={cambiarPreferencias} />}
              {vista === 'organizacion' && <Config seccion="organizacion" />}
              {vista === 'equipo' && <Equipo />}
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
              {/* #324: Sistema muestra los chequeos y la cola ficticios en
                  demo; fuera de demo lee los servicios reales como siempre. */}
              {vista === 'sistema' && <><EstadoSistema />{sesion?.esPropietario && <McpConexiones />}</>}
            </NavegacionConfig>
          )}
          {subpadre === 'ayuda' && (
            <div className="space-y-3">
              {vista === 'ayuda' && (
                <Documentacion vistasAccesibles={accesibles}>
                  <ComandosAtajos vistasAccesibles={accesibles} />
                </Documentacion>
              )}
            </div>
          )}
          </>)}
          </Suspense>
          </VistaErrorBoundary>
        </main>
      </AppShell>

      <div className={locked && cambiarAbierto ? 'fixed inset-0 z-[70] bg-paper' : undefined} data-testid={locked && cambiarAbierto ? 'bloqueo-fondo-opaco' : undefined}>
      <Modal
        open={cambiarAbierto}
        onClose={() => { if (!cambiando) { setCambiarAbierto(false); setPin(''); setCambioPinInvalido(false) } }}
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
          onChange={event => { setSellerId(event.target.value); setPin(''); setCambioPinInvalido(false) }}
          disabled={cambiando}
          className="mt-2 w-full"
        >
          {opcionesVendedor.map(seller => (
            <option key={seller.id} value={seller.id}>
              {seller.name || seller.nombre || seller.email}
            </option>
          ))}
        </Select>
        {esDemo && (
          <p className="mt-3 rounded-xl border border-fono-dark/20 bg-fono-dark/5 p-2 text-xs text-mute">
            Perfiles demo: <strong className="text-fore">2001</strong> vendedor ·{' '}
            <strong className="text-fore">2002</strong> gerente · <strong className="text-fore">2004</strong> caja ·{' '}
            <strong className="text-fore">2005</strong> técnico · <strong className="text-fore">2007</strong> delivery ·{' '}
            <strong className="text-fore">3001</strong> dueño
          </p>
        )}
        <label htmlFor="seller-switch-pin" className="mt-3 block text-sm font-semibold">
          {esDemo ? 'PIN demo' : 'PIN del vendedor'}
        </label>
        <PinSegmentado
          id="seller-switch-pin"
          autoFocus
          length={pinLengthCambio}
          value={pin}
          disabled={cambiando}
          invalido={cambioPinInvalido}
          discreto={angosta || isNativeIOS()}
          onChange={next => { setPin(next); setCambioPinInvalido(false) }}
          className="mt-2 [&_.pin-tecla]:!h-11 [&_.pin-tecla]:!w-11"
        />
        <p className="mt-5 text-xs text-mute">Esc para cerrar · tocar afuera también cierra</p>
      </Modal>
      </div>

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
          setCambioPinInvalido(false)
        }}
        onSalir={() => setSalirAbierto(true)}
        faceId={faceIdPendiente ? { onReintentar: pedirFaceId } : null}
      />

      <Modal
        open={ayudaAbierto}
        onClose={() => setAyudaAbierto(false)}
        title="Atajos de teclado" size="corto">
        <div className="mt-4">
          <CheatSheetAtajos />
        </div>
        <Link
          to="/ayuda/ayuda"
          onClick={() => setAyudaAbierto(false)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fono-light hover:underline"
        >
          Ver todos los comandos y atajos en Ayuda
          <Icon name="external" className="h-3.5 w-3.5" />
        </Link>
      </Modal>

      <div className={locked && salirAbierto ? 'fixed inset-0 z-[70] bg-paper' : undefined} data-testid={locked && salirAbierto ? 'bloqueo-fondo-opaco' : undefined}>
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
      </div>

      <ResaltarAjuste />
      {busquedaAbierta && (
        <Suspense fallback={null}>
          <GlobalSearch
            open
            onClose={() => setBusquedaAbierta(false)}
            onNavigate={ir}
            vistas={accesibles}
            esOwner={esOwner}
          />
        </Suspense>
      )}
    </>
  )
}
