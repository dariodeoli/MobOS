import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { vendedoresById, listVentas } from '@/lib/storage'
import { sessionApi } from '@/lib/api'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import Icon from '@/components/shared/Icon'
import AppShell from '@/components/app/AppShell'
import GlobalSearch from '@/components/app/GlobalSearch'
import { Button, ConfirmDialog, Eyebrow, Modal, PasswordInput, PinInput, Skeleton, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import SellerCustomers from '@/components/ventas/SellerCustomers'
import SellerCatalog from '@/components/ventas/SellerCatalog'
import SellerOrders from '@/components/ventas/SellerOrders'
import SellerQuotes from '@/components/ventas/SellerQuotes'
import SellerTools from '@/components/ventas/SellerTools'
import ResumenControl from '@/components/control/Resumen'
import Ganancias from '@/components/control/Ganancias'
import Gastos from '@/components/control/Gastos'
import Ads from '@/components/control/Ads'
import Ganadores from '@/components/control/Ganadores'
import Asistente from '@/components/control/Asistente'
import Historial from '@/components/control/Historial'
import Caja from '@/components/control/Caja'
import PaymentAccounts from '@/components/control/PaymentAccounts'
import Creditos from '@/components/control/Creditos'
import RolesPermisos from '@/components/control/RolesPermisos'

// Vistas pesadas en lazy: su código se descarga recién cuando se navega a ellas.
const VistaCargarVenta = lazy(() => import('@/components/ventas/VistaCargarVenta'))
const Reportes = lazy(() => import('@/components/control/Reportes'))
const Inventario = lazy(() => import('@/components/control/Inventario'))
const Compras = lazy(() => import('@/components/control/Compras'))
const Config = lazy(() => import('@/components/control/Config'))
const Vendedores = lazy(() => import('@/components/control/Vendedores'))
const Garantias = lazy(() => import('@/components/control/Garantias'))
const TradeInPipeline = lazy(() => import('@/components/control/TradeInPipeline'))

// Navegación por flujo de trabajo: primero la operación del día, después el
// catálogo/stock y al final las herramientas de gestión. Los permisos definen
// qué módulos aparecen, no una segunda "zona" visual.
const SELLER_NAV = [
  {
    titulo: 'Vender',
    items: [
      ['cargar', 'Cargar venta', 'receipt'],
      ['pedidos', 'Mis pedidos', 'box'],
      ['clientes', 'Clientes', 'users'],
    ],
  },
  {
    titulo: 'Herramientas',
    items: [
      ['productos', 'Productos', 'phone'],
      ['promociones', 'Promociones', 'store'],
      ['cotizador', 'Trade-In', 'refresh'],
      ['cotizaciones', 'Cotizaciones', 'report'],
    ],
  },
]

const OWNER_NAV = [
  {
    titulo: 'Operación',
    items: [
      ['cargar', 'Cargar venta', 'receipt'],
      ['pedidos', 'Pedidos', 'box'],
      ['clientes', 'Clientes', 'users'],
      ['promociones', 'Promociones', 'store'],
      ['cotizaciones', 'Cotizaciones', 'report'],
    ],
  },
  {
    titulo: 'Stock y servicio',
    items: [
      ['inventario', 'Inventario', 'box'],
      ['productos', 'Productos', 'phone'],
      ['compras', 'Compras', 'store'],
      ['tradein-admin', 'Trade-In', 'refresh'],
      ['servicio', 'Garantías y servicio', 'phone'],
    ],
  },
  {
    titulo: 'Negocio',
    items: [
      ['resumen', 'Resumen', 'chart'],
      ['analisis', 'Análisis', 'report'],
      ['finanzas', 'Finanzas', 'receipt'],
    ],
  },
  {
    titulo: 'Equipo',
    items: [['equipo', 'Equipo y configuración', 'users']],
  },
]

// Accesos directos de la barra inferior en móvil/tablet.
const SELLER_BOTTOM = [
  ['cargar', 'Vender', 'receipt'],
  ['pedidos', 'Pedidos', 'box'],
  ['clientes', 'Clientes', 'users'],
  ['productos', 'Productos', 'phone'],
  ['cotizaciones', 'Cotizaciones', 'report'],
]

const OWNER_BOTTOM = [
  ['resumen', 'Resumen', 'chart'],
  ['cargar', 'Vender', 'receipt'],
  ['pedidos', 'Pedidos', 'box'],
  ['inventario', 'Inventario', 'box'],
]

const LABELS = {
  clientes: 'Clientes',
  pedidos: 'Mis pedidos',
  productos: 'Productos',
  promociones: 'Promociones',
  cotizaciones: 'Cotizaciones',
  cotizador: 'Trade-In',
  cargar: 'Cargar venta',
  resumen: 'Resumen general',
  analisis: 'Análisis',
  finanzas: 'Finanzas',
  equipo: 'Equipo y configuración',
  inventario: 'Inventario',
  compras: 'Compras',
  'tradein-admin': 'Trade-In',
  servicio: 'Garantías y servicio',
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

function Subtabs({ value, onChange, items }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-fore/10 bg-ink p-2">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'rounded-xl px-3 py-2 text-sm font-medium transition',
            value === id ? 'bg-fono text-onbrand' : 'text-mute hover:bg-fore/5 hover:text-fore',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
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
    sucursal,
    perfilEmpresa,
  } = useSesion()
  const navigate = useNavigate()
  const { vista: routeVista } = useParams()
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [vista, setVista] = useState(routeVista || 'cargar')
  const [tradeIn, setTradeIn] = useState(null)
  const [analisisTab, setAnalisisTab] = useState('reportes')
  const [finanzasTab, setFinanzasTab] = useState('caja')
  const [equipoTab, setEquipoTab] = useState('vendedores')
  const identidad = `${usuario?.tenantId}:${usuario?.branchId}:${sesion?.vendedorId}:${usuario?.role}:${esDemo}`
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [pin, setPin] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('mobos:sidebar-collapsed') === '1',
  )
  const [locked, setLocked] = useState(false)
  const [lockPin, setLockPin] = useState('')
  const [lockError, setLockError] = useState('')
  const [lockBusy, setLockBusy] = useState(false)
  const [salirAbierto, setSalirAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [ayudaAbierto, setAyudaAbierto] = useState(false)
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)
  const cambioEnCurso = useRef(false)
  const lockEnCurso = useRef(false)
  const vendsById = vendedoresById()
  const toast = useToast()

  const accesibles = useMemo(
    () => (esOwner ? OWNER_NAV : SELLER_NAV).flatMap(group => group.items).map(([id]) => id),
    [esOwner],
  )

  // Si la URL apunta a una vista fuera del alcance del rol (ej. un vendedor en
  // /pos/inventario), se redirige a "cargar" de una sola vez. Sin el navigate
  // acá, los dos efectos se pisan en bucle: uno fuerza 'cargar' y el otro
  // vuelve a leer 'inventario' de la URL.
  useEffect(() => {
    if (!accesibles.includes(vista)) {
      setVista('cargar')
      navigate('/pos/cargar', { replace: true })
    }
  }, [accesibles, vista, navigate])
  // Sincroniza la URL → vista solo para rutas válidas del rol activo.
  useEffect(() => {
    if (routeVista && routeVista !== vista && accesibles.includes(routeVista)) setVista(routeVista)
  }, [routeVista, vista, accesibles])

  function ir(id) {
    const sellerIds = SELLER_NAV.flatMap(group => group.items).map(([key]) => key)
    if (!esOwner && !sellerIds.includes(id)) {
      setVista('cargar')
    } else {
      setVista(id)
      navigate(`/pos/${id}`)
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed(current => {
      const next = !current
      localStorage.setItem('mobos:sidebar-collapsed', next ? '1' : '0')
      return next
    })
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
  }

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
    if (locked && lockPin.length === 4) intentarDesbloqueo(lockPin)
  }, [locked, lockPin, intentarDesbloqueo])

  async function confirmarSalir() {
    setSaliendo(true)
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
    if (!cambiarAbierto) return undefined
    const cerrarConEscape = event =>
      event.key === 'Escape' && !cambiando && setCambiarAbierto(false)
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [cambiarAbierto, cambiando])

  useEffect(() => {
    if (!cambiarAbierto || pin.length !== 4 || !sellerId || cambioEnCurso.current) return
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
  }, [pin, sellerId, cambiarAbierto, esDemo, cambiarVendedor, entrarDemo, navigate, toast])

  return (
    <>
      <AppShell
        title={LABELS[vista]}
        nav={esOwner ? OWNER_NAV : SELLER_NAV}
        bottomNav={esOwner ? OWNER_BOTTOM : SELLER_BOTTOM}
        onOpenMenuLabel="Menú"
        active={vista}
        onNavigate={ir}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        empresa={empresa}
        sucursal={sucursal}
        esDemo={esDemo}
        sesionNombre={sesion?.nombre}
        esOwner={esOwner}
        perfilEmpresa={perfilEmpresa}
        onSwitchUser={abrirCambio}
        onLogout={() => setSalirAbierto(true)}
        onLockRequest={pedirBloqueo}
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
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
            <SelectorSucursal className="max-sm:hidden" />
            <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute md:flex">
              <Icon name="calendar" className="h-[15px] w-[15px]" />
              <span className="whitespace-nowrap">{fechaLarga}</span>
            </div>
            {vista !== 'cargar' && (
              <button
                onClick={() => {
                  setVista('cargar')
                  navigate('/pos/cargar')
                }}
                className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-onbrand transition hover:bg-fono-dark"
              >
                <Icon name="plus" className="h-[15px] w-[15px]" />
                <span className="hidden sm:inline">Cargar venta</span>
              </button>
            )}
            <button
              onClick={() => setAyudaAbierto(true)}
              className="rounded-lg px-2.5 py-2 text-sm font-semibold text-mute transition hover:bg-ink-700 hover:text-fore"
              title="Atajos de teclado"
              aria-label="Atajos de teclado"
            >
              ?
            </button>
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
              vendedoresById={vendsById}
              tradeInDraft={tradeIn?.identidad === identidad ? tradeIn : null}
              onTradeInConsumed={() => setTradeIn(null)}
            />
          </div>

          <div key={identidad}>
            {vista === 'clientes' && <SellerCustomers />}
            {vista === 'productos' && <SellerCatalog />}
            {vista === 'pedidos' && <SellerOrders />}
            {vista === 'promociones' && <SellerTools vista="promociones" />}
            {vista === 'cotizaciones' && <SellerQuotes />}
            <div hidden={vista !== 'cotizador'}>
              <SellerTools
                vista="cotizador"
                onCargarVenta={draft => {
                  setTradeIn({ ...draft, id: crypto.randomUUID(), identidad })
                  setVista('cargar')
                  navigate('/pos/cargar')
                }}
              />
            </div>
          </div>

          {esOwner && vista === 'inventario' && <Inventario />}
          {esOwner && vista === 'compras' && <Compras />}
          {esOwner && vista === 'tradein-admin' && <TradeInPipeline />}
          {esOwner && vista === 'servicio' && <Garantias />}
          {esOwner && vista === 'resumen' && <ResumenControl />}
          {esOwner && vista === 'analisis' && (
            <div>
              <Subtabs
                value={analisisTab}
                onChange={setAnalisisTab}
                items={[
                  ['reportes', 'Reportes'],
                  ['ganancias', 'Ganancias'],
                  ['ganadores', 'Ganadores'],
                  ['asistente', 'Asistente'],
                ]}
              />
              {analisisTab === 'reportes' && <Reportes />}
              {analisisTab === 'ganancias' && <Ganancias />}
              {analisisTab === 'ganadores' && <Ganadores />}
              {analisisTab === 'asistente' && <Asistente />}
            </div>
          )}
          {esOwner && vista === 'finanzas' && (
            <div>
              <Subtabs
                value={finanzasTab}
                onChange={setFinanzasTab}
                items={
                  esDemo
                    ? [
                        ['caja', 'Caja'],
                        ['gastos', 'Gastos'],
                        ['bancos', 'Bancos y cuentas'],
                        ['publicidad', 'Publicidad'],
                      ]
                    : [
                        ['caja', 'Caja'],
                        ['gastos', 'Gastos'],
                        ['bancos', 'Bancos y cuentas'],
                        ['creditos', 'Créditos'],
                      ]
                }
              />
              {finanzasTab === 'caja' && <Caja />}
              {finanzasTab === 'gastos' && <Gastos />}
              {finanzasTab === 'bancos' && <PaymentAccounts />}
              {finanzasTab === 'creditos' && <Creditos />}
              {esDemo && finanzasTab === 'publicidad' && <Ads />}
            </div>
          )}
          {esOwner && vista === 'equipo' && (
            <div>
              <Subtabs
                value={equipoTab}
                onChange={setEquipoTab}
                items={
                  esDemo
                    ? [
                        ['vendedores', 'Vendedores'],
                        ['roles', 'Roles y permisos'],
                        ['historial', 'Historial'],
                        ['configuracion', 'Configuración'],
                      ]
                    : [
                        ['vendedores', 'Vendedores'],
                        ['roles', 'Roles y permisos'],
                        ['configuracion', 'Configuración'],
                      ]
                }
              />
              {equipoTab === 'vendedores' && <Vendedores />}
              {equipoTab === 'roles' && <RolesPermisos />}
              {esDemo && equipoTab === 'historial' && <Historial />}
              {equipoTab === 'configuracion' && <Config />}
            </div>
          )}
          </Suspense>
        </main>
      </AppShell>

      {cambiarAbierto && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
          onMouseDown={event =>
            event.target === event.currentTarget && !cambiando && setCambiarAbierto(false)
          }
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cambiar-vendedor-title"
            className="w-full max-w-md rounded-3xl border border-fore/10 bg-ink p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Sesión segura</Eyebrow>
                <h2 id="cambiar-vendedor-title" className="mt-2 text-2xl font-bold">
                  Cambiar vendedor
                </h2>
              </div>
              <button
                onClick={() => setCambiarAbierto(false)}
                disabled={cambiando}
                className="rounded-lg px-2 py-1 text-2xl text-mute hover:text-fore"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-sm text-mute">
              Elegí quién registra la próxima venta y confirmá su PIN.
            </p>
            <label htmlFor="seller-switch" className="mt-6 block text-sm font-semibold">
              Vendedor
            </label>
            <select
              id="seller-switch"
              value={sellerId}
              onChange={event => setSellerId(event.target.value)}
              disabled={cambiando}
              className="mt-2 w-full rounded-xl border border-fore/10 bg-paper px-3 py-3 text-fore outline-none focus:border-fono-dark"
            >
              {opcionesVendedor.map(seller => (
                <option key={seller.id} value={seller.id}>
                  {seller.name || seller.nombre || seller.email}
                </option>
              ))}
            </select>
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
                  value={pin}
                  onChange={next => setPin(next)}
                  className="mt-2 disabled:opacity-50"
                />{' '}
              </>
            )}
            <p className="mt-5 text-xs text-mute">Esc para cerrar · tocar afuera también cierra</p>
          </section>
        </div>
      )}

      {locked && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-paper p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lock-title"
            className="w-full max-w-sm rounded-3xl border border-fore/10 bg-ink p-6 text-center shadow-2xl"
          >
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-fono/10 text-fono-light">
              <Icon name="lock" className="h-5 w-5" />
            </span>
            <Eyebrow className="mt-4">Bloqueado</Eyebrow>
            <h2 id="lock-title" className="mt-2 text-xl font-bold">
              {sesion?.nombre || 'Sesión protegida'}
            </h2>
            {sesion?.vendedorId ? (
              <>
                <p className="mt-2 text-sm text-mute">
                  Ingresá tu PIN de 4 dígitos para volver a la operación.
                </p>
                <PasswordInput
                  id="lock-pin"
                  autoFocus
                  inputMode="numeric"
                  maxLength={4}
                  value={lockPin}
                  disabled={lockBusy}
                  onChange={event => {
                    setLockPin(event.target.value.replace(/\D/g, '').slice(0, 4))
                  }}
                  className="mt-5 h-14 w-full rounded-xl border border-fore/10 bg-paper text-center text-3xl tracking-[.5em] outline-none focus:border-fono-dark"
                />
                {lockError && (
                  <p role="alert" className="mt-3 text-sm text-red-300">
                    {lockError}
                  </p>
                )}
                <Button
                  type="button"
                  className="mt-5 w-full"
                  disabled={lockBusy || lockPin.length !== 4}
                  onClick={() => intentarDesbloqueo(lockPin)}
                >
                  {lockBusy ? 'Verificando…' : 'Desbloquear'}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-mute">
                  Sesión protegida. No hay un vendedor activo que pueda desbloquear.
                </p>
                <Button
                  type="button"
                  className="mt-5 w-full"
                  onClick={() => window.location.reload()}
                >
                  Recargar la app
                </Button>
              </>
            )}
          </section>
        </div>
      )}

      <Modal
        open={ayudaAbierto}
        onClose={() => setAyudaAbierto(false)}
        title="Atajos de teclado"
        className="max-w-md"
      >
        <div className="space-y-2.5">
          {[
            ['Ctrl+K', 'Búsqueda global'],
            ['F1', 'Nueva venta'],
            ['F2', 'Buscar producto'],
            ['F3', 'Crear cliente'],
            ['F4', 'Cotizar equipo (Trade-In)'],
            ['Esc', 'Cerrar modales y diálogos'],
          ].map(([tecla, descripcion]) => (
            <div
              key={tecla}
              className="flex items-center justify-between gap-4 rounded-xl border border-fore/10 bg-fore/[.02] px-3.5 py-2.5"
            >
              <span className="text-sm text-fore">{descripcion}</span>
              <kbd className="shrink-0 rounded-md border border-ink-500 bg-ink-700 px-2 py-0.5 text-xs font-semibold text-mute">
                {tecla}
              </kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-mute">
          Los atajos no funcionan mientras escribís en un campo o tenés un diálogo abierto.
        </p>
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

      <GlobalSearch
        open={busquedaAbierta}
        onClose={() => setBusquedaAbierta(false)}
        onNavigate={ir}
      />
    </>
  )
}
