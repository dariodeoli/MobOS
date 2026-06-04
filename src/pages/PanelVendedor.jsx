import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { vendedoresById } from '@/lib/storage'
import ResumenWidgets from '@/components/ventas/ResumenWidgets'
import DeliveryHoy from '@/components/ventas/DeliveryHoy'
import FormularioVenta from '@/components/ventas/FormularioVenta'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import { Button } from '@/components/ui'

export default function PanelVendedor() {
  useLive()
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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Fono" className="h-7" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold hidden sm:inline opacity-90">
              {sesion.esPropietario ? '👑' : '🏬'} {sesion.nombre}
            </span>
            <button
              onClick={() => navigate('/celulares')}
              className="rounded-lg bg-white/15 px-3 h-9 text-sm font-bold hover:bg-white/25 transition"
              title="Lista de precios de celulares"
            >
              📱 <span className="hidden sm:inline">Precios</span>
            </button>
            <button
              onClick={() => navigate('/comparador')}
              className="rounded-lg bg-white/15 px-3 h-9 text-sm font-bold hover:bg-white/25 transition"
              title="Comparar modelos de celulares"
            >
              ⚖️ <span className="hidden sm:inline">Comparar</span>
            </button>
            <button
              onClick={() => navigate('/tradein')}
              className="rounded-lg bg-white/15 px-3 h-9 text-sm font-bold hover:bg-white/25 transition"
              title="Calcular Trade-In de un equipo"
            >
              🔄 <span className="hidden sm:inline">Trade-In</span>
            </button>
            <button
              onClick={abrirControl}
              className="rounded-lg bg-white/15 px-3 h-9 text-sm font-bold hover:bg-white/25 transition"
              title="Centro de Control"
            >
              🔐 <span className="hidden sm:inline">Control</span>
            </button>
            <button
              onClick={salir}
              className="rounded-lg bg-white/15 px-3 h-9 text-sm font-bold hover:bg-white/25 transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna izquierda: widgets en vivo (toda la tienda) */}
        <div className="lg:col-span-1 space-y-3">
          <ResumenWidgets vendedorId={null} />
          <DeliveryHoy />
        </div>

        {/* Columna derecha: cargar venta + lista */}
        <div className="lg:col-span-2 space-y-4">
          <FormularioVenta />
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
