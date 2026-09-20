import { lazy, Suspense, useEffect } from 'react'
import LoadingScreen from '@/components/app/LoadingScreen'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Button, ToastProvider } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Login from '@/pages/Login'
import PanelVendedor from '@/pages/PanelVendedor'
import { applyPageMetadata } from '@/lib/seo'
import DemoAccess from '@/pages/DemoAccess'
import PedidoPublico from '@/pages/PedidoPublico'
import ClientesLanding from '@/pages/ClientesLanding'
import GarantiaPublica from '@/pages/GarantiaPublica'
import CotizacionPublica from '@/pages/CotizacionPublica'
import CuentaPublica from '@/pages/CuentaPublica'
import RemitoPublico from '@/pages/RemitoPublico'
import AceptarInvitacion from '@/pages/AceptarInvitacion'
import VerificarCorreo from '@/pages/VerificarCorreo'

// Rutas secundarias en lazy: su código baja solo cuando se navega a ellas.
const Landing = lazy(() => import('@/pages/Landing'))
const TradeIn = lazy(() => import('@/pages/TradeIn'))
const Comparador = lazy(() => import('@/pages/Comparador'))
const Celulares = lazy(() => import('@/pages/Celulares'))
const Status = lazy(() => import('@/pages/Status'))
const RecuperarContrasena = lazy(() => import('@/pages/RecuperarContrasena'))

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
  if (estado === 'fuera') return <Navigate to="/login" replace />
  if (estado === 'sinEmpresa') return <SinEmpresa />
  return children
}

function SoloPropietario({ children }) {
  const { estado, sesion } = useSesion()
  if (estado === 'cargando') return <Cargando />
  if (estado === 'fuera') return <Navigate to="/login" replace />
  if (estado === 'sinEmpresa') return <SinEmpresa />
  if (!sesion?.esPropietario) return <Navigate to="/" replace />
  return children
}

function InicioPorRol() {
  const { sesion } = useSesion()
  // El dueño entra a la lectura diaria del negocio; quien vende entra directo
  // al flujo de venta. Ambos viven en la misma aplicación y navegación.
  return <Navigate to={sesion?.esPropietario ? "/pos/resumen" : "/pos/cargar"} replace />
}

// Conserva enlaces anteriores, pero toda la operación vive ahora bajo /pos.
function ControlRedirect() {
  const { tab } = useParams()
  const destino = {
    reportes: 'analisis', ganancias: 'analisis', ganadores: 'analisis', asistente: 'analisis',
    caja: 'finanzas', gastos: 'finanzas', ads: 'finanzas', publicidad: 'finanzas',
    vendedores: 'equipo', historial: 'equipo', config: 'equipo', configuracion: 'equipo',
    incompletos: 'productos', imagenes: 'productos', celulares: 'productos',
    garantias: 'servicio', tradein: 'tradein-admin',
  }[tab] || tab || 'resumen'
  return <Navigate to={`/pos/${destino}`} replace />
}

function AreaProtegida({ owner = false, children }) {
  return owner ? <SoloPropietario>{children}</SoloPropietario> : <Protegida>{children}</Protegida>
}

function MetadatosPagina({ publicPage = false }) {
  const { pathname } = useLocation()

  useEffect(() => {
    applyPageMetadata({ pathname, publicPage })
  }, [publicPage, pathname])

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
  if (landing) return <><MetadatosPagina publicPage /><Suspense fallback={<PaginaCargando />}>{status ? <Status /> : <Landing />}</Suspense></>
  return (
    <SesionProvider>
      <ToastProvider>
        <MetadatosPagina />
        <Suspense fallback={<PaginaCargando />}>
        <Routes>
          <Route path="/demo" element={<DemoAccess />} />
          <Route path="/login" element={<SoloFuera />} />
          <Route path="/restablecer-contrasena/:token?" element={<RecuperarContrasena />} />
          <Route path="/aceptar-invitacion/:token?" element={<AceptarInvitacion />} />
          <Route path="/verificar-correo/:token?" element={<VerificarCorreo />} />
          <Route path="/clientes" element={<ClientesLanding />} />
          <Route path="/portal" element={<ClientesLanding />} />
          <Route path="/pedido/:token" element={<PedidoPublico />} />
          <Route path="/p/:token" element={<PedidoPublico />} />
          <Route path="/garantia/:token" element={<GarantiaPublica />} />
          <Route path="/cotizacion/:token" element={<CotizacionPublica />} />
          <Route path="/cuenta/:token" element={<CuentaPublica />} />
          <Route path="/remito/:token" element={<RemitoPublico />} />
          <Route
            path="/"
            element={
              <Protegida>
                <InicioPorRol />
              </Protegida>
            }
          />
          {/* El pedido individual vive en la URL por su id interno: el código
              comercial (MOB-#0001) es solo para humanos y puede cambiar. */}
          <Route path="/pos/:vista?/:orderId?" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
          {/* Apartados con pestañas: cada subpágina es un slug hijo recuperable
              (/configuracion/negocio, /analisis/reportes, /finanzas/caja,
              /inventario/unidades…). */}
          <Route path="/configuracion/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/analisis/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/finanzas/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/inventario/:seccion?" element={<AreaProtegida owner><PanelVendedor /></AreaProtegida>} />
          <Route path="/control/:tab?" element={<AreaProtegida owner><ControlRedirect /></AreaProtegida>} />
          <Route path="/celulares" element={<AreaProtegida owner><Celulares /></AreaProtegida>} />
          <Route path="/comparador" element={<AreaProtegida owner><Comparador /></AreaProtegida>} />
          <Route path="/tradein" element={<AreaProtegida owner><TradeIn /></AreaProtegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </ToastProvider>
    </SesionProvider>
  )
}
