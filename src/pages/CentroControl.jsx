import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { cn } from '@/lib/utils'
import { Button, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { APP_NAME } from '@/lib/brand'
import Resumen from '@/components/control/Resumen'
import Inventario from '@/components/control/Inventario'
import ProductosIncompletos from '@/components/control/ProductosIncompletos'
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
import Caja from '@/components/control/Caja'
import Compras from '@/components/control/Compras'
import Garantias from '@/components/control/Garantias'

// [clave, etiqueta, componente, ícono]
const SECCIONES = [
  {
    titulo: 'Análisis',
    items: [
      ['resumen', 'Resumen', Resumen, 'chart'],
      ['ganancias', 'Ganancias', Ganancias, 'trending'],
      ['ganadores', 'Ganadores', Ganadores, 'trophy'],
      ['asistente', 'Asistente', Asistente, 'sparkles'],
    ],
  },
  {
    titulo: 'Operación',
    items: [
      ['incompletos', 'Productos incompletos', ProductosIncompletos, 'alert'],
      ['inventario', 'Inventario', Inventario, 'box'],
      ['compras', 'Compras', Compras, 'store'],
      ['garantias', 'Garantías y servicio', Garantias, 'phone'],
      ['celulares', 'Celulares', Celulares, 'phone'],
      ['tradein', 'Trade-In', TradeInAdmin, 'refresh'],
      ['imagenes', 'Imágenes', ImagenesComparador, 'image'],
    ],
  },
  {
    titulo: 'Finanzas',
    items: [
      ['caja', 'Caja', Caja, 'receipt'],
      ['gastos', 'Gastos', Gastos, 'receipt'],
      ['ads', 'Publicidad', Ads, 'megaphone'],
    ],
  },
  {
    titulo: 'Equipo',
    items: [
      ['vendedores', 'Vendedores', Vendedores, 'users'],
      ['historial', 'Historial', Historial, 'clock'],
      ['config', 'Configuración', Config, 'settings'],
    ],
  },
]
const TODAS = SECCIONES.flatMap((s) => s.items)

export default function CentroControl() {
  useLive()
  useAutoRefrescar()
  const navigate = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [pendiente, setPendiente] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const actual = TODAS.find(([k]) => k === tab)
  const Activa = actual[2]

  const dirtyRef = useRef(() => false)
  const registrarDirty = useCallback((fn) => {
    dirtyRef.current = typeof fn === 'function' ? fn : () => false
  }, [])

  function intentar(accion) {
    if (dirtyRef.current()) setPendiente(() => accion)
    else accion()
  }
  function cambiarTab(k) {
    setMenuAbierto(false)
    if (k !== tab) intentar(() => setTab(k))
  }

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
    <div className="min-h-dvh bg-ink text-white">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-600 bg-ink-800 transition-transform lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col pt-safe">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <img src="/logo-dark.svg" alt={APP_NAME} className="h-5" />
            <span className="text-sm font-medium text-mute">Control</span>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {SECCIONES.map((sec) => (
              <div key={sec.titulo}>
                <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-mute/70">
                  {sec.titulo}
                </div>
                <div className="space-y-0.5">
                  {sec.items.map(([k, label, , ico]) => (
                    <button
                      key={k}
                      onClick={() => cambiarTab(k)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                        tab === k
                          ? 'bg-fono/15 font-medium text-white ring-1 ring-fono/30'
                          : 'text-mute hover:bg-ink-700 hover:text-white',
                      )}
                    >
                      <Icon name={ico} className={cn('h-4 w-4', tab === k && 'text-fono-light')} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-ink-600 p-3">
            <button
              onClick={() => intentar(() => navigate('/'))}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute transition hover:bg-ink-700 hover:text-white"
            >
              <Icon name="back" className="h-4 w-4" />
              Volver al panel
            </button>
          </div>
        </div>
      </aside>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      {/* ── Contenido ────────────────────────────────────────────── */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink-600 bg-ink/80 pt-safe backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button
              onClick={() => setMenuAbierto(true)}
              className="rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white lg:hidden"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-mute">Centro de control</span>
              <span className="text-ink-500">/</span>
              <span className="font-medium">{actual[1]}</span>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Activa registrarDirty={registrarDirty} />
        </main>
      </div>

      {/* ── Aviso de cambios sin guardar ─────────────────────────── */}
      {pendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <h2 className="mb-1 font-semibold">Cambios sin guardar</h2>
            <p className="mb-5 text-sm text-mute">
              Tenés precios modificados que todavía no guardaste. Si salís ahora, se pierden.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPendiente(null)}>
                Seguir editando
              </Button>
              <Button
                variant="danger"
                className="flex-1"
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
