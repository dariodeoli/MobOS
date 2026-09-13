import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { vendedoresById, listVentas, getVendedores } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import VistaCargarVenta from '@/components/ventas/VistaCargarVenta'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import Icon from '@/components/shared/Icon'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import SellerCustomers from '@/components/ventas/SellerCustomers'
import SellerCatalog from '@/components/ventas/SellerCatalog'
import SellerOrders from '@/components/ventas/SellerOrders'
import SellerTools from '@/components/ventas/SellerTools'
import ResumenControl from '@/components/control/Resumen'
import Reportes from '@/components/control/Reportes'
import Inventario from '@/components/control/Inventario'
import Ganancias from '@/components/control/Ganancias'
import Gastos from '@/components/control/Gastos'
import Ads from '@/components/control/Ads'
import Ganadores from '@/components/control/Ganadores'
import Vendedores from '@/components/control/Vendedores'
import TradeInPipeline from '@/components/control/TradeInPipeline'
import Asistente from '@/components/control/Asistente'
import Historial from '@/components/control/Historial'
import Config from '@/components/control/Config'
import Caja from '@/components/control/Caja'
import Compras from '@/components/control/Compras'
import Garantias from '@/components/control/Garantias'

const SELLER_NAV = [{ titulo: 'Vender', items: [
  ['cargar', 'Cargar venta', 'receipt'],
  ['clientes', 'Clientes', 'users'],
  ['pedidos', 'Mis pedidos', 'box'],
  ['productos', 'Productos', 'phone'],
  ['promociones', 'Promociones', 'store'],
  ['cotizador', 'Trade-In', 'refresh'],
] }]

// Una sola aplicación: los permisos definen qué módulos aparecen, no una
// segunda "zona" visual. Los módulos extensos se agrupan en vistas internas.
const OWNER_NAV = [
  {
    titulo: 'Vender',
    items: [
      ['cargar', 'Cargar venta', 'receipt'],
      ['clientes', 'Clientes', 'users'],
      ['pedidos', 'Pedidos', 'box'],
      ['promociones', 'Promociones', 'store'],
    ],
  },
  {
    titulo: 'Catálogo y stock',
    items: [
      ['productos', 'Productos', 'phone'],
      ['inventario', 'Inventario', 'box'],
      ['compras', 'Compras', 'store'],
      ['tradein-admin', 'Trade-In', 'refresh'],
      ['servicio', 'Garantías y servicio', 'phone'],
    ],
  },
  {
    titulo: 'Gestión',
    items: [
      ['resumen', 'Resumen', 'chart'],
      ['analisis', 'Análisis', 'report'],
      ['finanzas', 'Finanzas', 'receipt'],
      ['equipo', 'Equipo y configuración', 'users'],
    ],
  },
]

const LABELS = {
  clientes: 'Clientes', pedidos: 'Mis pedidos', productos: 'Productos',
  promociones: 'Promociones', cotizador: 'Trade-In',
  cargar: 'Cargar venta',
  resumen: 'Resumen general', analisis: 'Análisis', finanzas: 'Finanzas',
  equipo: 'Equipo y configuración', inventario: 'Inventario', compras: 'Compras',
  'tradein-admin': 'Trade-In', servicio: 'Garantías y servicio',
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function Subtabs({ value, onChange, items }) {
  return <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#0b1822] p-2">{items.map(([id, label]) => <button key={id} type="button" onClick={() => onChange(id)} className={cn('rounded-xl px-3 py-2 text-sm font-medium transition', value === id ? 'bg-fono text-[#071018]' : 'text-mute hover:bg-white/5 hover:text-white')}>{label}</button>)}</div>
}

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const desfaseHoras = useReloj()
  const { sesion, usuario, vendedores, cambiarVendedor, entrarDemo, esDemo, salir } = useSesion()
  const navigate = useNavigate()
  const { vista: routeVista } = useParams()
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [vista, setVista] = useState(routeVista || 'cargar')
  const [tradeIn, setTradeIn] = useState(null)
  const [analisisTab, setAnalisisTab] = useState('reportes')
  const [finanzasTab, setFinanzasTab] = useState('caja')
  const [equipoTab, setEquipoTab] = useState('vendedores')
  const identidad = `${usuario?.tenantId}:${usuario?.branchId}:${sesion?.vendedorId}:${usuario?.role}:${esDemo}`
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [pin, setPin] = useState('')
  const [cambioError, setCambioError] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('mobos:sidebar-collapsed') === '1')
  const cambioEnCurso = useRef(false)
  const vendsById = vendedoresById()

  useEffect(() => {
    const accesibles = (esOwner ? OWNER_NAV : SELLER_NAV).flatMap(group => group.items).map(([id]) => id)
    if (!accesibles.includes(vista)) setVista('cargar')
  }, [esOwner, vista])
  useEffect(() => { if (routeVista && routeVista !== vista) setVista(routeVista) }, [routeVista, vista])

  function ir(id) {
    if (!esOwner && !SELLER_NAV[0].items.some(([key]) => key === id)) {
      setVista('cargar')
    } else { setVista(id); navigate(`/pos/${id}`) }
    setMenuAbierto(false)
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      localStorage.setItem('mobos:sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  const hoy = fechaClave()
  const delDia = esOwner ? ventasDelDia(listVentas(), hoy) : []
  const totalHoy = delDia.reduce((a, v) => a + num(v.precio), 0)
  const activos = new Set(delDia.map((v) => v.vendedorId).filter(Boolean)).size
  const [y, m, dd] = hoy.split('-')
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const diaSem = DIAS[new Date(`${hoy}T12:00:00`).getDay()]
  const fechaLarga = `${diaSem}, ${Number(dd)} de ${MESES[Number(m) - 1]}`
  const opcionesVendedor = vendedores?.length ? vendedores : [{ id: sesion?.vendedorId, name: sesion?.nombre }]

  function abrirCambio() {
    setSellerId(sesion?.vendedorId || opcionesVendedor[0]?.id || '')
    setPin('')
    setCambioError('')
    setCambiarAbierto(true)
  }

  useEffect(() => {
    if (!cambiarAbierto) return undefined
    const cerrarConEscape = (event) => event.key === 'Escape' && !cambiando && setCambiarAbierto(false)
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [cambiarAbierto, cambiando])

  useEffect(() => {
    if (!cambiarAbierto || pin.length !== 4 || !sellerId || cambioEnCurso.current) return
    cambioEnCurso.current = true
    setCambiando(true)
    if (esDemo && !['2001', '3001'].includes(pin)) {
      setCambioError('PIN demo inválido.')
      setPin('')
      setCambiando(false)
      cambioEnCurso.current = false
      return
    }
    const cambio = esDemo
      ? entrarDemo(pin === '3001' ? 'ADMIN' : 'VENDEDOR')
      : cambiarVendedor({ sellerId, pin })
    cambio.then(() => {
      setCambiarAbierto(false)
      if (esDemo && pin === '3001') navigate('/')
    }).catch((err) => {
      setCambioError(err?.message || 'PIN inválido. Probá de nuevo.')
      setPin('')
    }).finally(() => { cambioEnCurso.current = false; setCambiando(false) })
  }, [pin, sellerId, cambiarAbierto, esDemo, cambiarVendedor, entrarDemo, navigate])

  return (
    <div className="flex min-h-dvh flex-col bg-[#071018] text-sm text-white lg:flex-row">
      {/* ── Lateral ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-white/10 bg-[#101722] transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          sidebarCollapsed && 'lg:w-[76px]',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={cn('flex h-20 items-center gap-3 border-b border-white/10 px-5 pt-safe', sidebarCollapsed && 'lg:justify-center lg:px-3')}>
          <img src="/mobos-icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className={cn('flex flex-col leading-tight', sidebarCollapsed && 'lg:hidden')}>
            <span className="text-base font-bold tracking-tight">{APP_NAME}</span>
            <span className="text-[11px] text-slate-400">{esDemo ? 'Tienda de demostración' : 'Centro de operaciones'}</span>
          </div>
        </div>

        <nav className={cn('flex flex-1 flex-col gap-7 overflow-y-auto p-4', sidebarCollapsed && 'lg:p-3')}>
          {(esOwner ? OWNER_NAV : SELLER_NAV).map((g) => (
            <div key={g.titulo} className="flex flex-col gap-0.5">
              <div className={cn('px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-mute/70', sidebarCollapsed && 'lg:hidden')}>
                {g.titulo}
              </div>
              {g.items.map(([id, label, ico]) => {
                const activo = vista === id
                return (
                  <button
                    key={id}
                    onClick={() => ir(id)}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition',
                      sidebarCollapsed && 'lg:justify-center lg:px-0',
                      activo
                        ? 'border-fono/35 bg-fono/[.14] font-medium text-white'
                        : 'border-transparent text-mute hover:bg-ink-700 hover:text-white',
                    )}
                  >
                    <Icon
                      name={ico}
                      className={cn('h-4 w-4 shrink-0', activo && 'text-fono-light')}
                    />
                    <span className={cn('flex-1', sidebarCollapsed && 'lg:hidden')}>{label}</span>
                    {activo && <span className={cn('h-[5px] w-[5px] rounded-full bg-fono', sidebarCollapsed && 'lg:hidden')} />}
                    <span className="pointer-events-none absolute left-[68px] hidden rounded-md bg-[#172131] px-2 py-1 text-xs text-white shadow-lg group-hover:lg:block">{label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {esOwner && <div className={cn('flex flex-col gap-2.5 border-t border-fono/20 p-3.5 pb-safe', sidebarCollapsed && 'lg:hidden')}>
          <div className="rounded-2xl border border-fono/20 bg-gradient-to-br from-fono/10 to-ink-800 p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-white/60">
              Vendido hoy
            </div>
            <div className="mt-2 text-[22px] font-semibold tracking-tight text-fono-light tabular-nums">{gs(totalHoy)}</div>
            <div className="mt-1 text-[11.5px] text-white/60">
              {delDia.length} ventas · {activos} {activos === 1 ? 'vendedor' : 'vendedores'}
            </div>
          </div>
        </div>}
        <div className={cn('border-t border-white/10 p-3.5 pb-safe', sidebarCollapsed && 'lg:p-3')}>
          <div className={cn('mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3', sidebarCollapsed && 'lg:justify-center lg:border-0 lg:bg-transparent lg:p-0')} title={empresa?.nombre || 'Empresa'}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#38BDF8]/15 text-[#38BDF8]"><Icon name="store" className="h-4 w-4" /></span>
            <span className={cn('min-w-0', sidebarCollapsed && 'lg:hidden')}><strong className="block truncate text-xs text-white">{empresa?.nombre || 'Mi tienda'}</strong><small className="block truncate text-[10px] text-mute">{sucursal?.nombre || 'Todas las sucursales'}</small></span>
          </div>
          <button type="button" onClick={abrirCambio} className={cn('flex min-h-11 w-full items-center gap-2 rounded-xl p-2 text-left transition hover:bg-white/5', sidebarCollapsed && 'lg:justify-center lg:p-0')} title={sesion?.nombre || 'Usuario'}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#05F19C] text-sm font-bold text-[#090D16]">{(sesion?.nombre || 'U').charAt(0).toUpperCase()}</span>
            <span className={cn('min-w-0', sidebarCollapsed && 'lg:hidden')}><strong className="block truncate text-xs text-white">{sesion?.nombre || 'Usuario'}</strong><small className="block truncate text-[10px] uppercase tracking-wider text-mute">{esOwner ? 'Dueño' : 'Vendedor'}</small></span>
          </button>
        </div>
      </aside>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      {/* ── Contenido ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-white/10 bg-[#071018]/85 px-4 pt-safe backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuAbierto(true)}
              className="-ml-1 rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white lg:hidden"
              title="Menú"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
          <div className="hidden sm:block"><span className="block text-[11px] font-bold uppercase tracking-[.18em] text-[#05F19C]">{APP_NAME}</span><span className="mt-1 block truncate text-lg font-semibold tracking-tight">{LABELS[vista]}</span></div>
          </div>

          <div className="flex items-center gap-2.5">
            <SelectorSucursal />
            <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute md:flex">
              <Icon name="calendar" className="h-[15px] w-[15px]" />
              <span className="whitespace-nowrap">{fechaLarga}</span>
            </div>
            {vista !== 'cargar' && (
              <button
                onClick={() => { setVista('cargar'); navigate('/pos/cargar') }}
                className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-white transition hover:bg-fono-dark"
              >
                <Icon name="plus" className="h-[15px] w-[15px]" />
                <span className="hidden sm:inline">Cargar venta</span>
              </button>
            )}
            <button onClick={toggleSidebar} className="hidden rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white lg:inline-flex" title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'} aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}><Icon name="menu" className="h-4 w-4" /></button>
            <button onClick={abrirCambio} className="hidden min-h-11 rounded-lg border border-fono/30 bg-fono/[.12] px-3 py-2 text-xs font-medium text-fono-light transition hover:bg-fono/20 sm:inline-flex" title="Cambiar vendedor" aria-label="Cambiar vendedor"><Icon name="users" className="h-4 w-4" /><span className="hidden md:inline">Cambiar vendedor</span></button>
            <button
              onClick={salir}
              className="rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white"
              title="Salir"
              aria-label="Salir"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </header>

        {desfaseHoras > 0 && (
          <div className="flex items-center justify-center gap-2 bg-bad px-4 py-2.5 text-center text-sm font-medium">
            <Icon name="alert" className="h-4 w-4" />
            La fecha de este equipo está desfasada ~{desfaseHoras} h. Corregila antes de cargar
            ventas.
          </div>
        )}

        <main className="flex-1 bg-gradient-to-b from-[#071018] to-[#09151d] p-4 md:p-8">
          <div key={`venta:${identidad}`} hidden={vista !== 'cargar'}>
            {tradeIn?.identidad === identidad && <div role="status" className="mx-auto mb-5 max-w-4xl space-y-2 rounded-2xl border border-fono/30 bg-fono/10 p-4">
              <p className="font-semibold">Canje acordado: {tradeIn.model} · {gs(tradeIn.value)}</p>
              <p>IMEI / serial: {tradeIn.imei}</p>
              <p className="text-sm text-slate-300">Preparando el canje como parte de pago. El equipo ingresará a la pipeline al confirmar la venta.</p>
              <button className="text-sm underline" onClick={() => setTradeIn(null)}>Descartar ficha</button>
            </div>}
            <VistaCargarVenta vendedoresById={vendsById} tradeInDraft={tradeIn?.identidad === identidad ? tradeIn : null} onTradeInConsumed={() => setTradeIn(null)} />
          </div>

          <div key={identidad}>
            {vista === 'clientes' && <SellerCustomers />}
            {vista === 'productos' && <SellerCatalog />}
            {vista === 'pedidos' && <SellerOrders />}
            {vista === 'promociones' && <SellerTools vista="promociones" />}
            <div hidden={vista !== 'cotizador'}><SellerTools vista="cotizador" onCargarVenta={(draft) => { setTradeIn({ ...draft, id: crypto.randomUUID(), identidad }); setVista('cargar'); navigate('/pos/cargar') }} /></div>
          </div>

          {esOwner && vista === 'inventario' && <div className="mx-auto max-w-7xl"><Inventario /></div>}
          {esOwner && vista === 'compras' && <div className="mx-auto max-w-7xl"><Compras /></div>}
          {esOwner && vista === 'tradein-admin' && <div className="mx-auto max-w-7xl"><TradeInPipeline /></div>}
          {esOwner && vista === 'servicio' && <div className="mx-auto max-w-7xl"><Garantias /></div>}
          {esOwner && vista === 'resumen' && <div className="mx-auto max-w-7xl"><ResumenControl /></div>}
          {esOwner && vista === 'analisis' && <div className="mx-auto max-w-7xl"><Subtabs value={analisisTab} onChange={setAnalisisTab} items={[["reportes", "Reportes"], ["ganancias", "Ganancias"], ["ganadores", "Ganadores"], ["asistente", "Asistente"]]} />{analisisTab === 'reportes' && <Reportes />}{analisisTab === 'ganancias' && <Ganancias />}{analisisTab === 'ganadores' && <Ganadores />}{analisisTab === 'asistente' && <Asistente />}</div>}
          {esOwner && vista === 'finanzas' && <div className="mx-auto max-w-7xl"><Subtabs value={finanzasTab} onChange={setFinanzasTab} items={[["caja", "Caja"], ["gastos", "Gastos"], ["publicidad", "Publicidad"]]} />{finanzasTab === 'caja' && <Caja />}{finanzasTab === 'gastos' && <Gastos />}{finanzasTab === 'publicidad' && <Ads />}</div>}
          {esOwner && vista === 'equipo' && <div className="mx-auto max-w-7xl"><Subtabs value={equipoTab} onChange={setEquipoTab} items={[["vendedores", "Vendedores"], ["historial", "Historial"], ["configuracion", "Configuración"]]} />{equipoTab === 'vendedores' && <Vendedores />}{equipoTab === 'historial' && <Historial />}{equipoTab === 'configuracion' && <Config />}</div>}
        </main>
      </div>

      {cambiarAbierto && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && !cambiando && setCambiarAbierto(false)}><section role="dialog" aria-modal="true" aria-labelledby="cambiar-vendedor-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1822] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#15D7B8]">Sesión segura</p><h2 id="cambiar-vendedor-title" className="mt-2 text-2xl font-bold">Cambiar vendedor</h2></div><button onClick={() => setCambiarAbierto(false)} disabled={cambiando} className="rounded-lg px-2 py-1 text-2xl text-slate-500 hover:text-white" aria-label="Cerrar">×</button></div><p className="mt-2 text-sm text-slate-400">Elegí quién registra la próxima venta y confirmá su PIN.</p><label htmlFor="seller-switch" className="mt-6 block text-sm font-semibold">Vendedor</label><select id="seller-switch" value={sellerId} onChange={(event) => setSellerId(event.target.value)} disabled={cambiando} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] px-3 py-3 text-white outline-none focus:border-[#15D7B8]">{opcionesVendedor.map((seller) => <option key={seller.id} value={seller.id}>{seller.name || seller.nombre || seller.email}</option>)}</select>{esDemo ? <><p className="mt-4 rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-3 text-xs text-slate-400">PIN demo vendedor: <strong className="text-white">2001</strong> · dueño: <strong className="text-white">3001</strong></p><label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">PIN demo</label><input id="seller-switch-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} disabled={cambiando} onChange={(event) => { setCambioError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none focus:border-[#15D7B8]" /> </> : <><label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">PIN del vendedor</label><input id="seller-switch-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} disabled={cambiando} onChange={(event) => { setCambioError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none focus:border-[#15D7B8]" /> </>}{cambioError && <p role="alert" className="mt-3 text-sm text-red-300">{cambioError}</p>}<p className="mt-5 text-xs text-slate-500">Esc para cerrar · tocar afuera también cierra</p></section></div>}

    </div>
  )
}
