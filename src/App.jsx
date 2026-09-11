import { Routes, Route, Navigate } from 'react-router-dom'
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
import Demo from '@/pages/Demo'

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

// Mientras Supabase resuelve si hay sesión no se decide nada: si mandáramos
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

function AppFooter() {
  return (
    <footer className="mobos-footer border-t border-ink-600 bg-ink-900 px-4 py-3 text-center text-[11px] text-mute">
      <span>{APP_VERSION}</span>{' · '}
      <a href={APP_CREDIT_URL} target="_blank" rel="noreferrer" className="text-fono-light hover:underline">{APP_CREDIT}</a>
    </footer>
  )
}

export default function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (host === 'controlaria.online' || host === 'www.controlaria.online') return <Landing />
  return (
    <SesionProvider>
      <Routes>
        <Route path="/demo" element={<Demo />} />
        <Route path="/login" element={<SoloFuera />} />
        <Route
          path="/"
          element={
            <Protegida>
              <PanelVendedor />
            </Protegida>
          }
        />
        <Route
          path="/celulares"
          element={
            <Protegida>
              <Celulares />
            </Protegida>
          }
        />
        <Route
          path="/comparador"
          element={
            <Protegida>
              <Comparador />
            </Protegida>
          }
        />
        <Route
          path="/tradein"
          element={
            <Protegida>
              <TradeIn />
            </Protegida>
          }
        />
        <Route
          path="/control"
          element={
            <SoloPropietario>
              <CentroControl />
            </SoloPropietario>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppFooter />
    </SesionProvider>
  )
}
