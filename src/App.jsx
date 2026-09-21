import { lazy, Suspense, useEffect } from 'react'
import LoadingScreen from '@/components/app/LoadingScreen'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { publicUrls } from '@/lib/urls'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Button, ToastProvider } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Login from '@/pages/Login'
import PanelVendedor from '@/pages/PanelVendedor'
import { applyPageMetadata } from '@/lib/seo'
import { isDemoRuntime } from '@/lib/demoMode'
import DemoAccess from '@/pages/DemoAccess'
import PedidoPublico from '@/pages/PedidoPublico'
import PanelDelivery from '@/pages/PanelDelivery'
import CarritoPublico from '@/pages/CarritoPublico'
import GarantiaPublica from '@/pages/GarantiaPublica'
import CotizacionPublica from '@/pages/CotizacionPublica'
import CuentaPublica from '@/pages/CuentaPublica'
import PortalCliente from '@/pages/PortalCliente'
import RemitoPublico from '@/pages/RemitoPublico'
import AceptarInvitacion from '@/pages/AceptarInvitacion'
import VerificarCorreo from '@/pages/VerificarCorreo'
import { DESTINO_LEGADO } from '@/lib/rutas'

// Rutas secundarias en lazy: su código baja solo cuando se navega a ellas.
const Landing = lazy(() => import('@/pages/Landing'))
const Comparador = lazy(() => import('@/pages/Comparador'))
const Celulares = lazy(() => import('@/pages/Celulares'))
const Status = lazy(() => import('@/pages/Status'))
const RecuperarContrasena = lazy(() => import('@/pages/RecuperarContrasena'))
const PortalClientesEntrada = lazy(() => import('@/pages/PortalClientesEntrada'))
const RecuperarEmpresa = lazy(() => import('@/pages/RecuperarEmpresa'))

// El usuario existe pero nadie lo sumó todavía a una tienda. Pasa cuando el
// dueño crea la cuenta y aún no la asignó a su empresa.
function SinEmpresa() {
  const { sesion, salir } = useSesion()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-fono/15">
        <Icon name="store" className="h-5 w-5 text-fono-light" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-fore">Todavía no estás en ninguna tienda</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
          Tu cuenta <strong className="text-fore">{sesion?.correo}</strong> está creada, pero el
          dueño de la tienda todavía no te sumó al equipo. Pedile que te agregue con este mismo
          correo.
        </p>
      </div>
      <Button variant="outline" onClick={salir}>
        Salir
      </Button>
    </div>
  )
}

// Mientras el API resuelve si hay sesión no se decide nada: si mandáramos
// al login en ese instante, al recargar la página te sacaría siempre.
function Cargando() {
  return <LoadingScreen />
}

// Espera breve mientras una ruta secundaria descarga su código.
function PaginaCargando() {
  return <LoadingScreen mensaje="Cargando…" />
}

// El login solo tiene sentido si NO hay sesión; si ya entraste, al panel.
function SoloFuera() {
  const { estado } = useSesion()
  if (estado === 'cargando') return <Cargando />
  if (estado === 'dentro') return <Navigate to="/" replace />
  if (estado === 'sinEmpresa') return <SinEmpresa />
  return <Login />
}

function Protegida({ children }) {
  const { estado } = useSesion()
  if (estado === 'cargando') return <Cargando />
  // Sin sesión, el panel es la demo pública (#192): se entra por perfiles en
  // /demo en lugar de mandar al login. El acceso real vive en /login.
  if (estado === 'fuera') return <Navigate to="/demo" replace />
  if (estado === 'sinEmpresa') return <SinEmpresa />
  return children
}

function SoloPropietario({ children }) {
  const { estado, sesion } = useSesion()
  if (estado === 'cargando') return <Cargando />
  if (estado === 'fuera') return <Navigate to="/demo" replace />
  if (estado === 'sinEmpresa') return <SinEmpresa />
  if (!sesion?.esPropietario) return <Navigate to="/" replace />
  return children
}

function InicioPorRol() {
  const { sesion } = useSesion()
  // El dueño entra a la lectura diaria del negocio; quien vende entra directo
  // al POS; el técnico a su taller y el repartidor a su reparto.
  if (sesion?.rol === 'TECNICO') return <Navigate to="/servicio" replace />
  if (sesion?.rol === 'REPARTIDOR') return <Navigate to="/delivery/repartos" replace />
  return <Navigate to={sesion?.esPropietario ? "/resumen" : "/pos"} replace />
}

// Conserva enlaces anteriores: /control/<tab> apunta a la URL nueva.
function ControlRedirect() {
  const { tab } = useParams()
  return <Navigate to={DESTINO_LEGADO[tab || 'resumen'] || DESTINO_LEGADO['']} replace />
}

// Conserva enlaces anteriores: toda la operación vive en slugs planos
// (/pos, /pedidos, /configuracion/…) y las URLs viejas redirigen una sola vez.
function PosRedirect() {
  const { vista, orderId } = useParams()
  const { search, hash } = useLocation()
  const destino = DESTINO_LEGADO[vista || ''] || DESTINO_LEGADO['']
  const detalle = orderId && destino === '/pedidos' ? `/${encodeURIComponent(orderId)}` : ''
  return <Navigate to={`${destino}${detalle}${search}${hash}`} replace />
}

// El slug viejo /ventas (#116) sigue funcionando: redirige al POS conservando
// el query y el hash.
function VentasRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={`/pos${search}${hash}`} replace />
}

function AreaProtegida({ owner = false, children }) {
  return owner ? <SoloPropietario>{children}</SoloPropietario> : <Protegida>{children}</Protegida>
}

// Los enlaces viejos del pedido (/p/<token> y /pedido/<token>) siguen abriendo:
// se redirigen a la canónica /pedidos/<token> conservando el token (#197). En
// el host de la app el destino es el portal de clientes para no chocar con la
// ruta interna /pedidos/:orderId.
function RedirigirPedidoPublico({ externo = false, mismo = false }) {
  const { token } = useParams()
  const { search } = useLocation()
  const destino = `/pedidos/${encodeURIComponent(token || '')}${search || ''}`
  if (externo) return <Navigate to={`${publicUrls.clientPortal}${destino}`} replace />
  if (mismo) return <Navigate to={destino} replace />
  // Dev, localhost y e2e: la página se abre en el mismo origen (sin canónica).
  return <PedidoPublico />
}

function MetadatosPagina({ publicPage = false, clientPortal = false }) {
  const { pathname } = useLocation()

  useEffect(() => {
    applyPageMetadata({ pathname, publicPage, clientPortal })
  }, [clientPortal, publicPage, pathname])

  return null
}

function RedireccionDominio({ destino }) {
  useEffect(() => {
    window.location.replace(destino)
  }, [destino])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-6 text-center text-sm text-mute">
      Redirigiendo a MobOS…
    </div>
  )
}

export default function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const dominioAnterior = {
    'controlaria.online': 'https://moboss.online',
    'www.controlaria.online': 'https://moboss.online',
    'app.controlaria.online': 'https://app.moboss.online',
  }[host]
  if (dominioAnterior) {
    const ruta = `${window.location.pathname}${window.location.search}${window.location.hash}`
    return <RedireccionDominio destino={`${dominioAnterior}${ruta}`} />
  }

  const landingPreview = import.meta.env.DEV && window.location.pathname === '/landing-preview'
  const landing = ['moboss.online', 'www.moboss.online'].includes(host) || landingPreview
  const status = typeof window !== 'undefined' && window.location.pathname === '/status'
  // Solo la app publicada redirige los enlaces viejos al subdominio canónico;
  // en dev/local se abre la página acá mismo (#197).
  const canonicoPedido = ['app.moboss.online', 'www.app.moboss.online'].includes(host)
  if (landing) return <><MetadatosPagina publicPage /><Suspense fallback={<PaginaCargando />}>{status ? <Status /> : <Landing />}</Suspense></>

  const clientPortalPreview = import.meta.env.DEV && window.location.pathname === '/clientes-preview'
  const clientPortal = ['clientes.moboss.online', 'www.clientes.moboss.online'].includes(host) || clientPortalPreview
  if (clientPortal) {
    return (
      <>
        <MetadatosPagina publicPage clientPortal />
        <Suspense fallback={<PaginaCargando />}>
          <Routes>
            <Route path="/" element={<PortalClientesEntrada />} />
            <Route path="/cuenta/:token" element={<CuentaPublica />} />
            <Route path="/portal/:token" element={<PortalCliente />} />
            <Route path="/pedidos/:token" element={<PedidoPublico />} />
            <Route path="/pedido/:token" element={<RedirigirPedidoPublico mismo />} />
            <Route path="/p/:token" element={<RedirigirPedidoPublico mismo />} />
            <Route path="/carrito/:token" element={<CarritoPublico />} />
            <Route path="/garantia/:token" element={<GarantiaPublica />} />
            <Route path="/cotizacion/:token" element={<CotizacionPublica />} />
            <Route path="/remito/:token" element={<RemitoPublico />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </>
    )
  }
  return (
    <SesionProvider>
      <ToastProvider demo={isDemoRuntime}>
        <MetadatosPagina />
        <Suspense fallback={<PaginaCargando />}>
        <Routes>
          <Route path="/demo" element={<DemoAccess />} />
          <Route path="/login" element={<SoloFuera />} />
          <Route path="/restablecer-contrasena/:token?" element={<RecuperarContrasena />} />
          <Route path="/recuperar-empresa" element={<RecuperarEmpresa />} />
          <Route path="/aceptar-invitacion/:token?" element={<AceptarInvitacion />} />
          <Route path="/verificar-correo/:token?" element={<VerificarCorreo />} />
          <Route path="/pedido/:token" element={<RedirigirPedidoPublico externo={canonicoPedido} />} />
          <Route path="/p/:token" element={<RedirigirPedidoPublico externo={canonicoPedido} />} />
          <Route path="/carrito/:token" element={<CarritoPublico />} />
          <Route path="/garantia/:token" element={<GarantiaPublica />} />
          <Route path="/cotizacion/:token" element={<CotizacionPublica />} />
          <Route path="/cuenta/:token" element={<CuentaPublica />} />
          <Route path="/portal/:token" element={<PortalCliente />} />
          <Route path="/remito/:token" element={<RemitoPublico />} />
          <Route
            path="/"
            element={
              <Protegida>
                <InicioPorRol />
              </Protegida>
            }
          />
          {/* Vistas planas del panel: slugs simples y profesionales (#116).
              El pedido individual vive en la URL por su id interno: el código
              comercial (MOB-#0001) es solo para humanos y puede cambiar. */}
          <Route path="/pos" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          {/* El slug viejo /ventas (#116) redirige al POS. */}
          <Route path="/ventas" element={<AreaProtegida><VentasRedirect /></AreaProtegida>} />
          <Route path="/pedidos/:orderId?" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/delivery" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          {/* Panel del repartidor: pedidos asignados y rendiciones (#179). */}
          <Route path="/delivery/repartos" element={<AreaProtegida><PanelDelivery /></AreaProtegida>} />
          <Route path="/delivery/rendiciones" element={<AreaProtegida><PanelDelivery /></AreaProtegida>} />
          <Route path="/clientes" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/productos" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/promociones" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/precios" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/cotizaciones" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/plantillas" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/trade-in" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/compras" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/servicio" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/garantias" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/autorizaciones" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          <Route path="/resumen" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          {/* Apartados con pestañas: cada subpágina es un slug hijo recuperable
              (/configuracion/negocio, /analisis/reportes, /finanzas/caja,
              /inventario/unidades…). */}
          <Route path="/configuracion/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/analisis/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/finanzas/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/inventario/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/control/:tab?" element={<AreaProtegida owner><ControlRedirect /></AreaProtegida>} />
          {/* Enlaces guardados: /pos/<vista> y /tradein redirigen al slug nuevo. */}
          <Route path="/pos/:vista/:orderId?" element={<AreaProtegida><PosRedirect /></AreaProtegida>} />
          <Route path="/celulares" element={<AreaProtegida owner><Celulares /></AreaProtegida>} />
          <Route path="/comparador" element={<AreaProtegida owner><Comparador /></AreaProtegida>} />
          <Route path="/tradein" element={<Navigate to="/trade-in" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </ToastProvider>
    </SesionProvider>
  )
}
