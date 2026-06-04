import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLive } from '@/hooks/useLive'
import { Button, Card } from '@/components/ui'
import Resumen from '@/components/control/Resumen'
import Inventario from '@/components/control/Inventario'
import Ganancias from '@/components/control/Ganancias'
import Gastos from '@/components/control/Gastos'
import Ads from '@/components/control/Ads'
import Ganadores from '@/components/control/Ganadores'
import Vendedores from '@/components/control/Vendedores'
import Celulares from '@/components/control/Celulares'
import ImagenesComparador from '@/components/control/ImagenesComparador'
import TradeInAdmin from '@/components/control/TradeInAdmin'
import Asistente from '@/components/control/Asistente'
import Historial from '@/components/control/Historial'
import Config from '@/components/control/Config'

const TABS = [
  ['resumen', '📊 Resumen', Resumen],
  ['asistente', '🤖 Asistente', Asistente],
  ['ganancias', '📈 Ganancias', Ganancias],
  ['inventario', '📦 Inventario', Inventario],
  ['ganadores', '🏆 Ganadores', Ganadores],
  ['gastos', '🧾 Gastos', Gastos],
  ['ads', '📣 Meta Ads', Ads],
  ['celulares', '📱 Celulares', Celulares],
  ['imagenes', '🖼️ Imágenes', ImagenesComparador],
  ['tradein', '🔄 Trade-In', TradeInAdmin],
  ['vendedores', '🧑‍💼 Vendedores', Vendedores],
  ['historial', '📜 Historial', Historial],
  ['config', '⚙️ Config', Config],
]

export default function CentroControl() {
  useLive()
  const navigate = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [pendiente, setPendiente] = useState(null) // acción a ejecutar si confirma salir
  const Activa = TABS.find(([k]) => k === tab)[2]

  // La pestaña activa registra acá una función que indica si tiene cambios sin guardar.
  const dirtyRef = useRef(() => false)
  const registrarDirty = useCallback((fn) => {
    dirtyRef.current = typeof fn === 'function' ? fn : () => false
  }, [])

  // Intenta ejecutar una acción de navegación; si hay cambios sin guardar, pide confirmar.
  function intentar(accion) {
    if (dirtyRef.current()) setPendiente(() => accion)
    else accion()
  }
  function cambiarTab(k) {
    if (k !== tab) intentar(() => setTab(k))
  }

  // Aviso del navegador al cerrar/recargar con cambios sin guardar.
  useEffect(() => {
    const h = (e) => {
      if (dirtyRef.current()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-30 bg-slate-900 text-white pt-safe shadow-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-lg">👑</span> Centro de Control
          </div>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/15"
            onClick={() => intentar(() => navigate('/'))}
          >
            ← Volver al panel
          </Button>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-2 overflow-x-auto">
          <div className="flex gap-1 pb-2">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => cambiarTab(k)}
                className={
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition ' +
                  (tab === k ? 'bg-white text-slate-900' : 'text-white/70 hover:bg-white/10')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        <Activa registrarDirty={registrarDirty} />
      </main>

      {pendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-3xl mb-2">⚠️</div>
            <h2 className="text-center font-bold mb-1">Cambios sin guardar</h2>
            <p className="text-center text-sm text-slate-600 mb-4">
              Tenés precios modificados que todavía no guardaste. Si salís ahora, se pierden.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="ghost" onClick={() => setPendiente(null)}>
                Seguir editando
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const accion = pendiente
                  setPendiente(null)
                  accion()
                }}
              >
                Salir sin guardar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
