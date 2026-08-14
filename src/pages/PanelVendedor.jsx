import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { vendedoresById, listVentas } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import ResumenWidgets from '@/components/ventas/ResumenWidgets'
import ResumenDia from '@/components/ventas/ResumenDia'
import DeliveryHoy from '@/components/ventas/DeliveryHoy'
import FormularioVenta from '@/components/ventas/FormularioVenta'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/celulares', label: 'Precios', icon: 'phone' },
  { to: '/comparador', label: 'Comparar', icon: 'chart' },
  { to: '/tradein', label: 'Trade-In', icon: 'refresh' },
]

const TABS = [
  ['cargar', 'Cargar venta', 'receipt'],
  ['resumen', 'Resumen del día', 'chart'],
]

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const desfaseHoras = useReloj()
  const { sesion, salir, setPropietario } = useSesion()
  const navigate = useNavigate()
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [tab, setTab] = useState('cargar')
  const vendsById = vendedoresById()

  function abrirControl() {
    if (sesion.esPropietario) navigate('/control')
    else setPidiendoClave(true)
  }

  const hoy = fechaClave()
  const totalHoy = ventasDelDia(listVentas(), hoy).reduce((a, v) => a + num(v.precio), 0)

  return (
    <div className="min-h-dvh bg-ink text-white">
      {/* ── Barra superior ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-ink-600 bg-ink/80 pt-safe backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo-dark.svg" alt="Fono" className="h-5" />
            <span className="hidden text-sm text-mute md:inline">
              {hoy.split('-').reverse().join('/')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-0.5 rounded-lg border border-ink-600 bg-ink-800 p-1">
              {NAV.map((n) => (
                <button
                  key={n.to}
                  onClick={() => navigate(n.to)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-mute transition hover:bg-ink-700 hover:text-white"
                  title={n.label}
                >
                  <Icon name={n.icon} className="h-4 w-4" />
                  <span className="hidden lg:inline">{n.label}</span>
                </button>
              ))}
            </nav>

            <button
              onClick={abrirControl}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fono px-3 text-sm font-medium text-white transition hover:bg-fono-dark"
            >
              <Icon name="lock" className="h-4 w-4" />
              <span className="hidden sm:inline">Control</span>
            </button>
            <button
              onClick={salir}
              className="rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white"
              title="Salir"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Pestañas ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex gap-1">
            {TABS.map(([k, label, ico]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition',
                  tab === k
                    ? 'border-fono font-medium text-white'
                    : 'border-transparent text-mute hover:text-white',
                )}
              >
                <Icon name={ico} className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 pb-1 text-sm sm:flex">
            <span className="text-mute">Hoy</span>
            <span className="font-semibold">{gs(totalHoy)}</span>
          </div>
        </div>
      </header>

      {desfaseHoras > 0 && (
        <div className="flex items-center justify-center gap-2 bg-bad px-4 py-2.5 text-center text-sm font-medium">
          <Icon name="alert" className="h-4 w-4" />
          La fecha de este equipo está desfasada ~{desfaseHoras} h. Corregila antes de cargar ventas.
        </div>
      )}

      {/* ── Contenido ────────────────────────────────────────────── */}
      <main className="p-4 md:p-6">
        {tab === 'cargar' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-3">
              <ResumenWidgets vendedorId={null} />
              <DeliveryHoy />
            </div>
            <div className="xl:col-span-4">
              <FormularioVenta />
            </div>
            <div className="lg:col-span-2 xl:col-span-5">
              <ListaVentasDia vendedorId={null} mostrarVendedor vendedoresById={vendsById} />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl">
            <ResumenDia />
          </div>
        )}
      </main>

      {pidiendoClave && (
        <ClavePanelDialog
          onCancel={() => setPidiendoClave(false)}
          onOk={() => {
            setPidiendoClave(false)
            setPropietario(true)
            navigate('/control')
          }}
        />
      )}
    </div>
  )
}
