import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import ClavePanelDialog from '@/components/shared/ClavePanelDialog'
import { Button, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'

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
    <div className="glow-blue relative flex min-h-dvh flex-col items-center justify-center bg-ink p-5 pt-safe pb-safe">
      <img src="/logo-dark.svg" alt="Fono Mobile Store" className="mb-2 w-44" />
      <p className="mb-8 text-sm text-mute">Sistema interno de ventas</p>

      <Card className="w-full max-w-md">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-fono/15">
          <Icon name="store" className="h-5 w-5 text-fono-light" />
        </div>
        <h1 className="mb-1 text-lg font-semibold">¿Cómo querés entrar?</h1>
        <p className="mb-6 text-sm text-mute">
          Entrá como tienda para cargar ventas (vas a elegir el vendedor en cada venta), o como
          dueño para ir al Centro de Control.
        </p>

        <div className="space-y-2.5">
          <Button className="w-full" onClick={entrarTienda}>
            Entrar a la tienda
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setPidiendoClave(true)}>
            Centro de Control
          </Button>
        </div>
      </Card>

      <p className="mt-6 text-xs text-mute/60">Fono Mobile Store · v0.1</p>

      {pidiendoClave && (
        <ClavePanelDialog onCancel={() => setPidiendoClave(false)} onOk={entrarDueno} />
      )}
    </div>
  )
}
