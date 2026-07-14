import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import { vendedoresById } from '@/lib/storage'
import ResumenWidgets from '@/components/ventas/ResumenWidgets'
import DeliveryHoy from '@/components/ventas/DeliveryHoy'
import FormularioVenta from '@/components/ventas/FormularioVenta'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import { Button } from '@/components/ui'

export default function PanelVendedor() {
  useLive()
  useAutoRefrescar()
  const { sesion, salir, setPropietario } = useSesion()
  const navigate = useNavigate()
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const vendsById = vendedoresById()

  function abrirControl() {
    if (sesion.esPropietario) {
      navigate('/control')
    } else {
      setPidiendoClave(true)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-fono text-white pt-safe shadow-md">
        <div className="mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Fono" className="h-7" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm font-semibold hidden md:inline opacity-90">
              {sesion.esPropietario ? '👑' : '🏬'} {sesion.nombre}
            </span>

            {/* Grupo de herramientas */}
            <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1">
              <button
                onClick={() => navigate('/celulares')}
                className="rounded-lg px-2.5 h-8 text-sm font-bold hover:bg-white/20 transition"
                title="Lista de precios de celulares"
              >
                📱 <span className="hidden lg:inline">Precios</span>
              </button>
              <button
                onClick={() => navigate('/comparador')}
                className="rounded-lg px-2.5 h-8 text-sm font-bold hover:bg-white/20 transition"
                title="Comparar modelos de celulares"
              >
                ⚖️ <span className="hidden lg:inline">Comparar</span>
              </button>
              <button
                onClick={() => navigate('/tradein')}
                className="rounded-lg px-2.5 h-8 text-sm font-bold hover:bg-white/20 transition"
                title="Calcular Trade-In de un equipo"
              >
                🔄 <span className="hidden lg:inline">Trade-In</span>
              </button>
            </div>

            {/* Centro de control (acceso del dueño) */}
            <button
              onClick={abrirControl}
              className="rounded-lg bg-white text-fono px-3 h-9 text-sm font-bold hover:bg-white/90 transition"
              title="Centro de Control"
            >
              🔐 <span className="hidden sm:inline">Control</span>
            </button>

            {/* Salir */}
            <button
              onClick={salir}
              className="rounded-lg px-3 h-9 text-sm font-semibold text-white/80 hover:bg-white/15 hover:text-white transition"
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-4">
        {/* Columna izquierda: widgets en vivo (toda la tienda) */}
        <div className="xl:col-span-3 space-y-3">
          <ResumenWidgets vendedorId={null} />
          <DeliveryHoy />
        </div>

        {/* Columna del medio: cargar venta */}
        <div className="xl:col-span-4">
          <FormularioVenta />
        </div>

        {/* Columna derecha: lista de ventas del día */}
        <div className="lg:col-span-2 xl:col-span-5">
          <ListaVentasDia vendedorId={null} mostrarVendedor vendedoresById={vendsById} />
        </div>
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
