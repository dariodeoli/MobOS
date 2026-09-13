import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Login from '@/pages/Login'
import PanelVendedor from '@/pages/PanelVendedor'
import Celulares from '@/pages/Celulares'
import Comparador from '@/pages/Comparador'
import TradeIn from '@/pages/TradeIn'
import { applyPageMetadata } from '@/lib/seo'
import ProductFooter from '@/components/app/ProductFooter'
import Landing from '@/pages/Landing'
import DemoAccess from '@/pages/DemoAccess'
import Status from '@/pages/Status'
import RecuperarContrasena from '@/pages/RecuperarContrasena'

// El usuario existe pero nadie lo sumó todavía a una tienda. Pasa cuando el
// dueño crea la cuenta y aún no la asignó a su empresa.
function SinEmpresa() {
  const { sesion, salir } = useSesion()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink p-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-fono/15">
        <Icon name="store" className="h-5 w-5 text-fono-light" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-white">Todavía no estás en ninguna tienda</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
          Tu cuenta <strong className="text-white">{sesion?.correo}</strong> está creada, pero el
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
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink">
      <div className="flex items-center gap-3 text-sm text-mute">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-500 border-t-fono" />
        Cargando tu tienda…
      </div>
    </div>
  )
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
  return <Navigate to="/pos/cargar" replace />
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

function AppFooter() {
  const { esDemo, salir } = useSesion()
  return (
    <ProductFooter className="border-ink-600 text-mute">
      {esDemo && <span>Usuario demo · Datos de prueba <button onClick={salir} className="mx-2 underline">Salir de demo</button> · </span>}
    </ProductFooter>
  )
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
    <div className="flex min-h-dvh items-center justify-center bg-ink p-6 text-center text-sm text-mute">
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

  const landing = ['moboss.online', 'www.moboss.online'].includes(host)
  const status = typeof window !== 'undefined' && window.location.pathname === '/status'
  if (landing) return <><MetadatosPagina publicPage />{status ? <Status /> : <Landing />}</>
  return (
    <SesionProvider>
      <MetadatosPagina />
      <Routes>
        <Route path="/demo" element={<DemoAccess />} />
        <Route path="/login" element={<SoloFuera />} />
        <Route path="/restablecer-contrasena" element={<RecuperarContrasena />} />
        <Route
          path="/"
          element={
            <Protegida>
              <InicioPorRol />
            </Protegida>
          }
        />
        <Route path="/pos/:vista?" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
        <Route path="/control/:tab?" element={<AreaProtegida owner><ControlRedirect /></AreaProtegida>} />
        <Route path="/celulares" element={<AreaProtegida owner><Celulares /></AreaProtegida>} />
        <Route path="/comparador" element={<AreaProtegida owner><Comparador /></AreaProtegida>} />
        <Route path="/tradein" element={<AreaProtegida owner><TradeIn /></AreaProtegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppFooter />
    </SesionProvider>
  )
}
