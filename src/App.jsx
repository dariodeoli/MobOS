import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Login from '@/pages/Login'
import PanelVendedor from '@/pages/PanelVendedor'
import CentroControl from '@/pages/CentroControl'
import Celulares from '@/pages/Celulares'
import Comparador from '@/pages/Comparador'
import TradeIn from '@/pages/TradeIn'
import { APP_CREDIT, APP_CREDIT_URL, APP_VERSION } from '@/lib/brand'
import Landing from '@/pages/Landing'
import DemoAccess from '@/pages/DemoAccess'

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
  return <Navigate to={sesion?.esPropietario ? '/control/resumen' : '/pos/cargar'} replace />
}

function AreaProtegida({ owner = false, children }) {
  return owner ? <SoloPropietario>{children}</SoloPropietario> : <Protegida>{children}</Protegida>
}

function AppFooter() {
  const { esDemo, salir } = useSesion()
  return (
    <footer className="mobos-footer border-t border-ink-600 bg-ink-900 px-4 py-3 text-center text-[11px] text-mute">
      <span>{APP_VERSION}</span>{' · '}
      {esDemo && <span>Usuario demo · Datos de prueba <button onClick={salir} className="mx-2 underline">Salir de demo</button> · </span>}
      <a href={APP_CREDIT_URL} target="_blank" rel="noreferrer" className="text-fono-light hover:underline">{APP_CREDIT}</a>
    </footer>
  )
}

function MetadatosPagina({ landing }) {
  const { pathname } = useLocation()

  useEffect(() => {
    const origin = window.location.origin
    const secciones = {
      '/control/resumen': 'Resumen',
      '/control/reportes': 'Reportes',
      '/control/ganancias': 'Ganancias',
      '/pos/cargar': 'Punto de venta',
      '/pos/clientes': 'Clientes',
      '/pos/pedidos': 'Pedidos',
      '/login': 'Acceso',
      '/demo': 'Demo interactiva',
    }
    const seccion = secciones[pathname]
    document.title = landing
      ? 'MobOS · Control total para tu tienda móvil'
      : `${seccion || 'Gestión de tienda'} · MobOS`

    const setMeta = (selector, attribute, value) => {
      const element = document.head.querySelector(selector)
      if (element) element.setAttribute(attribute, value)
    }
    const canonical = document.head.querySelector('link[rel="canonical"]')
    if (canonical) canonical.setAttribute('href', `${origin}${landing ? '/' : pathname}`)
    setMeta('meta[property="og:url"]', 'content', `${origin}${landing ? '/' : pathname}`)
    setMeta('meta[name="robots"]', 'content', landing ? 'index, follow' : 'noindex, nofollow')
  }, [landing, pathname])

  return null
}

export default function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const landing = ['controlaria.online', 'www.controlaria.online', 'moboss.online', 'www.moboss.online'].includes(host)
  if (landing) return <><MetadatosPagina landing /><Landing /></>
  return (
    <SesionProvider>
      <MetadatosPagina />
      <Routes>
        <Route path="/demo" element={<DemoAccess />} />
        <Route path="/login" element={<SoloFuera />} />
        <Route
          path="/"
          element={
            <Protegida>
              <InicioPorRol />
            </Protegida>
          }
        />
        <Route path="/pos/:vista?" element={<AreaProtegida><PanelVendedor /></AreaProtegida>} />
        <Route path="/control/:tab?" element={<AreaProtegida owner><CentroControl /></AreaProtegida>} />
        <Route path="/celulares" element={<AreaProtegida owner><Celulares /></AreaProtegida>} />
        <Route path="/comparador" element={<AreaProtegida owner><Comparador /></AreaProtegida>} />
        <Route path="/tradein" element={<AreaProtegida owner><TradeIn /></AreaProtegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppFooter />
    </SesionProvider>
  )
}
