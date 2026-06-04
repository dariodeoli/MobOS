import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import { Button, Card } from '@/components/ui'

export default function Login() {
  useLive()
  const { entrar } = useSesion()
  const navigate = useNavigate()
  const [pidiendoClave, setPidiendoClave] = useState(false)

  function entrarTienda() {
    // Sesión de tienda (una sola compu compartida). El vendedor de cada venta
    // se elige en el formulario de carga, no acá.
    entrar({ vendedorId: null, nombre: 'Tienda', esPropietario: false })
    navigate('/')
  }

  function entrarDueno() {
    // Acceso propio del dueño: entra como propietario y va directo al Control.
    entrar({ vendedorId: null, nombre: 'Dueño', esPropietario: true })
    setPidiendoClave(false)
    navigate('/control')
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-fono-dark via-fono to-fono-accent flex flex-col items-center justify-center p-5 pt-safe pb-safe">
      <img src="/logo.svg" alt="Fono Mobile Store" className="w-56 mb-2" />
      <p className="text-white/70 text-sm mb-8 font-semibold">Sistema interno de ventas</p>

      <Card className="w-full max-w-md text-center">
        <div className="text-5xl mb-3">🏬</div>
        <h1 className="text-lg font-bold mb-1">¿Cómo querés entrar?</h1>
        <p className="text-sm text-slate-500 mb-6">
          Entrá como tienda para cargar ventas (vas a elegir el vendedor en cada venta), o como
          dueño para ir al Centro de Control.
        </p>

        <div className="space-y-2.5">
          <Button className="w-full" onClick={entrarTienda}>
            🛒 Entrar a la tienda
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setPidiendoClave(true)}>
            👑 Centro de Control
          </Button>
        </div>
      </Card>

      <p className="text-white/50 text-xs mt-6">Fono Mobile Store · v0.1</p>

      {pidiendoClave && (
        <ClavePanelDialog onCancel={() => setPidiendoClave(false)} onOk={entrarDueno} />
      )}
    </div>
  )
}
