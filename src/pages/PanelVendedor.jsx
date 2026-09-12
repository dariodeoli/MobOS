import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { vendedoresById, listVentas, getVendedores } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import PanelDia from '@/components/ventas/PanelDia'
import Mayoristas from '@/components/ventas/Mayoristas'
import VistaCargarVenta from '@/components/ventas/VistaCargarVenta'
import ControlResumen from '@/components/ventas/ControlResumen'
import ResumenDia from '@/components/ventas/ResumenDia'
import ResumenWidgets from '@/components/ventas/ResumenWidgets'
import DeliveryHoy from '@/components/ventas/DeliveryHoy'
import FormularioVenta from '@/components/ventas/FormularioVenta'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import Icon from '@/components/shared/Icon'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import SellerCustomers from '@/components/ventas/SellerCustomers'
import SellerCatalog from '@/components/ventas/SellerCatalog'
import SellerOrders from '@/components/ventas/SellerOrders'
import SellerTools from '@/components/ventas/SellerTools'

const SELLER_NAV = [{ titulo: 'Mi operación', items: [
  ['cargar', 'Cargar venta', 'receipt'],
  ['clientes', 'Clientes', 'users'],
  ['pedidos', 'Mis pedidos', 'box'],
  ['productos', 'Productos', 'phone'],
  ['promociones', 'Promociones', 'store'],
  ['cotizador', 'Trade-In', 'refresh'],
] }]

// Navegación agrupada del lateral.
const NAV = [
  {
    titulo: 'Ventas',
    items: [
      ['cargar', 'Cargar venta', 'receipt'],
      ['promociones', 'Promociones', 'store'],
      ['mayorista', 'Mayoristas', 'store'],
      ['panel', 'Panel del día', 'chart'],
      ['resumen', 'Resumen del día', 'trending'],
    ],
  },
  {
    titulo: 'Equipo',
    items: [['control', 'Centro de control', 'users']],
  },
  {
    titulo: 'Herramientas',
    items: [
      ['precios', 'Lista de precios', 'phone'],
      ['comparar', 'Comparar modelos', 'box'],
      ['tradein', 'Trade-In', 'refresh'],
    ],
  },
]

const LABELS = {
  clientes: 'Clientes', pedidos: 'Mis pedidos', productos: 'Productos',
  promociones: 'Promociones', cotizador: 'Trade-In',
  cargar: 'Cargar venta',
  control: 'Centro de control',
  mayorista: 'Mayoristas',
  panel: 'Panel del día',
  resumen: 'Resumen del día',
}
const RUTAS = { precios: 'celulares', comparar: 'comparador', tradein: 'trade-in' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const desfaseHoras = useReloj()
  const { sesion, usuario, vendedores, cambiarVendedor, entrarDemo, esDemo, salir } = useSesion()
  const navigate = useNavigate()
  const { slug, vista: routeVista } = useParams()
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [vista, setVista] = useState(routeVista || 'cargar')
  const [tradeIn, setTradeIn] = useState(null)
  const identidad = `${usuario?.tenantId}:${usuario?.branchId}:${sesion?.vendedorId}:${usuario?.role}:${esDemo}`
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [pin, setPin] = useState('')
  const [cambioError, setCambioError] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const cambioEnCurso = useRef(false)
  const vendsById = vendedoresById()

  useEffect(() => {
    if (!esOwner && !SELLER_NAV[0].items.some(([id]) => id === vista)) setVista('cargar')
  }, [esOwner, vista])
  useEffect(() => { if (routeVista && routeVista !== vista) setVista(routeVista) }, [routeVista, vista])

  function abrirControl() {
    if (sesion?.esPropietario) navigate(`/area/${slug}/control/resumen`)
  }

  function ir(id) {
    if (id === 'control') {
      if (esOwner) navigate(`/area/${slug}/control/resumen`)
    } else if (!esOwner && !SELLER_NAV[0].items.some(([key]) => key === id)) {
      setVista('cargar')
    }
    else if (RUTAS[id]) navigate(`/area/${slug}/${RUTAS[id]}`)
    else { setVista(id); navigate(`/area/${slug}/pos/${id}`) }
    setMenuAbierto(false)
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
          'fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-white/10 bg-[#0b1822] transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5 pt-safe">
          <img src="/favicon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight">{APP_NAME}</span>
            <span className="text-[11px] text-slate-400">{esDemo ? 'Tienda de demostración' : 'Centro de operaciones'}</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-7 overflow-y-auto p-4">
          {(esOwner ? NAV : SELLER_NAV).map((g) => (
            <div key={g.titulo} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-mute/70">
                {g.titulo}
              </div>
              {g.items.map(([id, label, ico]) => {
                const activo = vista === id
                return (
                  <button
                    key={id}
                    onClick={() => ir(id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition',
                      activo
                        ? 'border-fono/35 bg-fono/[.14] font-medium text-white'
                        : 'border-transparent text-mute hover:bg-ink-700 hover:text-white',
                    )}
                  >
                    <Icon
                      name={ico}
                      className={cn('h-4 w-4 shrink-0', activo && 'text-fono-light')}
                    />
                    <span className="flex-1">{label}</span>
                    {activo && <span className="h-[5px] w-[5px] rounded-full bg-fono" />}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {esOwner && <div className="flex flex-col gap-2.5 border-t border-fono/20 p-3.5 pb-safe">
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
            <div className="hidden sm:block"><span className="block text-[11px] font-bold uppercase tracking-[.18em] text-[#15D7B8]">{APP_NAME}</span><span className="mt-1 block truncate text-lg font-semibold tracking-tight">{LABELS[vista]}</span></div>
            <button onClick={abrirCambio} className="ml-1.5 whitespace-nowrap rounded-full border border-fono/30 bg-fono/[.12] px-2.5 py-1 text-[11.5px] font-medium text-fono-light transition hover:bg-fono/20" title="Cambiar vendedor">
              {sesion?.nombre || (sesion?.esPropietario ? 'Dueño' : 'Vendedor')} · Cambiar
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <SelectorSucursal />
            <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute md:flex">
              <Icon name="calendar" className="h-[15px] w-[15px]" />
              <span className="whitespace-nowrap">{fechaLarga}</span>
            </div>
            {vista !== 'cargar' && (
              <button
                onClick={() => { setVista('cargar'); navigate(`/area/${slug}/pos/cargar`) }}
                className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-white transition hover:bg-fono-dark"
              >
                <Icon name="plus" className="h-[15px] w-[15px]" />
                <span className="hidden sm:inline">Cargar venta</span>
              </button>
            )}
            {esOwner && (
              <button
                onClick={abrirControl}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[13px] text-mute transition hover:text-white"
                title="Centro de control"
              >
                <Icon name="chart" className="h-4 w-4" />
                <span className="hidden lg:inline">Control</span>
              </button>
            )}
            <button
              onClick={salir}
              className="rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white"
              title="Salir"
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
            <div hidden={vista !== 'cotizador'}><SellerTools vista="cotizador" onCargarVenta={(draft) => { setTradeIn({ ...draft, id: crypto.randomUUID(), identidad }); setVista('cargar'); navigate(`/area/${slug}/pos/cargar`) }} /></div>
          </div>

          {esOwner && vista === 'mayorista' && <Mayoristas />}

          {vista === 'control' &&
            (esOwner ? (
              <ControlResumen onAbrirPanel={() => navigate('/control')} />
            ) : (
              <p className="py-10 text-center text-sm text-mute">Acceso solo para el dueño.</p>
            ))}

          {esOwner && vista === 'panel' && <PanelDia vendedoresById={vendsById} />}

          {esOwner && vista === 'resumen' && (
            <div className="mx-auto max-w-6xl">
              <ResumenDia />
            </div>
          )}
        </main>
      </div>

      {cambiarAbierto && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && !cambiando && setCambiarAbierto(false)}><section role="dialog" aria-modal="true" aria-labelledby="cambiar-vendedor-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1822] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#15D7B8]">Sesión segura</p><h2 id="cambiar-vendedor-title" className="mt-2 text-2xl font-bold">Cambiar vendedor</h2></div><button onClick={() => setCambiarAbierto(false)} disabled={cambiando} className="rounded-lg px-2 py-1 text-2xl text-slate-500 hover:text-white" aria-label="Cerrar">×</button></div><p className="mt-2 text-sm text-slate-400">Elegí quién registra la próxima venta y confirmá su PIN.</p><label htmlFor="seller-switch" className="mt-6 block text-sm font-semibold">Vendedor</label><select id="seller-switch" value={sellerId} onChange={(event) => setSellerId(event.target.value)} disabled={cambiando} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] px-3 py-3 text-white outline-none focus:border-[#15D7B8]">{opcionesVendedor.map((seller) => <option key={seller.id} value={seller.id}>{seller.name || seller.nombre || seller.email}</option>)}</select>{esDemo ? <><p className="mt-4 rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-3 text-xs text-slate-400">PIN demo vendedor: <strong className="text-white">2001</strong> · dueño: <strong className="text-white">3001</strong></p><label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">PIN demo</label><input id="seller-switch-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} disabled={cambiando} onChange={(event) => { setCambioError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none focus:border-[#15D7B8]" /> </> : <><label htmlFor="seller-switch-pin" className="mt-5 block text-sm font-semibold">PIN del vendedor</label><input id="seller-switch-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} disabled={cambiando} onChange={(event) => { setCambioError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none focus:border-[#15D7B8]" /> </>}{cambioError && <p role="alert" className="mt-3 text-sm text-red-300">{cambioError}</p>}<p className="mt-5 text-xs text-slate-500">Esc para cerrar · tocar afuera también cierra</p></section></div>}

    </div>
  )
}
