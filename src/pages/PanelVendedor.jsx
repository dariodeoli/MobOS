import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { useReloj } from '@/hooks/useReloj'
import { vendedoresById, listVentas, getVendedores } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import PanelDia from '@/components/ventas/PanelDia'
import Mayoristas from '@/components/ventas/Mayoristas'
import ControlResumen from '@/components/ventas/ControlResumen'
import ResumenDia from '@/components/ventas/ResumenDia'
import ResumenWidgets from '@/components/ventas/ResumenWidgets'
import DeliveryHoy from '@/components/ventas/DeliveryHoy'
import FormularioVenta from '@/components/ventas/FormularioVenta'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Navegación agrupada del lateral.
const NAV = [
  {
    titulo: 'Ventas',
    items: [
      ['cargar', 'Cargar venta', 'receipt'],
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
  cargar: 'Cargar venta',
  control: 'Centro de control',
  mayorista: 'Mayoristas',
  panel: 'Panel del día',
  resumen: 'Resumen del día',
}
const RUTAS = { precios: '/celulares', comparar: '/comparador', tradein: '/tradein' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const desfaseHoras = useReloj()
  const { sesion, salir, setPropietario } = useSesion()
  const navigate = useNavigate()
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [vista, setVista] = useState('cargar')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const vendsById = vendedoresById()

  function abrirControl() {
    if (sesion.esPropietario) navigate('/control')
    else setPidiendoClave(true)
  }

  function ir(id) {
    if (id === 'control') {
      if (sesion.esPropietario) setVista('control')
      else setPidiendoClave(true)
    }
    else if (RUTAS[id]) navigate(RUTAS[id])
    else setVista(id)
    setMenuAbierto(false)
  }

  const hoy = fechaClave()
  const delDia = ventasDelDia(listVentas(), hoy)
  const totalHoy = delDia.reduce((a, v) => a + num(v.precio), 0)
  const activos = new Set(delDia.map((v) => v.vendedorId).filter(Boolean)).size
  const [y, m, dd] = hoy.split('-')
  const fechaLarga = `${Number(dd)} de ${MESES[Number(m) - 1]} de ${y}`

  return (
    <div className="flex min-h-dvh bg-ink text-sm text-white">
      {/* ── Lateral ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col border-r border-fono/30 bg-ink-800 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-fono/20 px-5 pt-safe">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-fono to-fono-dark text-[13px] font-bold">
            F
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Fono</span>
            <span className="text-[11px] text-mute">Panel de ventas</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-[22px] overflow-y-auto p-3">
          {NAV.map((g) => (
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

        <div className="flex flex-col gap-2.5 border-t border-fono/20 p-3.5 pb-safe">
          <div className="rounded-xl border border-fono/30 bg-blue-blur p-3.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-white/60">
              Vendido hoy
            </div>
            <div className="mt-1 text-[22px] font-semibold tracking-tight">{gs(totalHoy)}</div>
            <div className="mt-1 text-[11.5px] text-white/60">
              {delDia.length} ventas · {activos} {activos === 1 ? 'vendedor' : 'vendedores'}
            </div>
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-fono/30 bg-ink/85 px-4 pt-safe backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuAbierto(true)}
              className="-ml-1 rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-white lg:hidden"
              title="Menú"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <span className="hidden text-mute sm:inline">Fono</span>
            <span className="hidden text-ink-500 sm:inline">/</span>
            <span className="truncate font-medium">{LABELS[vista]}</span>
            <span className="ml-1.5 whitespace-nowrap rounded-full border border-fono/30 bg-fono/[.12] px-2.5 py-0.5 text-[11.5px] font-medium text-fono-light">
              {sesion.esPropietario ? 'Dueño' : 'Vendedor'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute md:flex">
              <Icon name="calendar" className="h-[15px] w-[15px]" />
              <span className="whitespace-nowrap">{fechaLarga}</span>
            </div>
            {vista !== 'cargar' && (
              <button
                onClick={() => setVista('cargar')}
                className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-white transition hover:bg-fono-dark"
              >
                <Icon name="plus" className="h-[15px] w-[15px]" />
                <span className="hidden sm:inline">Cargar venta</span>
              </button>
            )}
            <button
              onClick={abrirControl}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[13px] text-mute transition hover:text-white"
              title="Centro de control"
            >
              <Icon name="lock" className="h-4 w-4" />
              <span className="hidden lg:inline">Control</span>
            </button>
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

        <main className="flex-1 p-4 md:p-6">
          {vista === 'cargar' && (
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
          )}

          {vista === 'mayorista' && <Mayoristas />}

          {vista === 'control' &&
            (sesion.esPropietario ? (
              <ControlResumen onAbrirPanel={() => navigate('/control')} />
            ) : (
              <p className="py-10 text-center text-sm text-mute">Acceso solo para el dueño.</p>
            ))}

          {vista === 'panel' && <PanelDia vendedoresById={vendsById} />}

          {vista === 'resumen' && (
            <div className="mx-auto max-w-6xl">
              <ResumenDia />
            </div>
          )}
        </main>
      </div>

      {pidiendoClave && (
        <ClavePanelDialog
          onCancel={() => setPidiendoClave(false)}
          onOk={() => {
            setPidiendoClave(false)
            setPropietario(true)
            setVista('control')
          }}
        />
      )}
    </div>
  )
}
