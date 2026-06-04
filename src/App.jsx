import { Routes, Route, Navigate } from 'react-router-dom'
import { SesionProvider, useSesion } from '@/lib/sesion'
import Login from '@/pages/Login'
import PanelVendedor from '@/pages/PanelVendedor'
import CentroControl from '@/pages/CentroControl'
import Celulares from '@/pages/Celulares'
import Comparador from '@/pages/Comparador'
import TradeIn from '@/pages/TradeIn'

function Protegida({ children }) {
  const { sesion } = useSesion()
  if (!sesion) return <Navigate to="/login" replace />
  return children
}

function SoloPropietario({ children }) {
  const { sesion } = useSesion()
  if (!sesion) return <Navigate to="/login" replace />
  if (!sesion?.esPropietario) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <SesionProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
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
    </SesionProvider>
  )
}
