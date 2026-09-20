import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import { APP_NAME } from '@/lib/brand'

// Entrada pública del portal de clientes: acá llega quien recibe el enlace de
// la tienda. El acceso real es por token personal (cuenta, pedido, garantía o
// cotización), así que esta página explica qué puede ver y cómo pedir su enlace.
const VENTAJAS = [
  ['money', 'Saldo y vencimientos', 'Cuánto queda pendiente y cuándo vence, sin llamar a la tienda.'],
  ['box', 'Pedidos', 'El estado de cada compra y el comprobante para descargar.'],
  ['check', 'Garantías activas', 'Qué cubre cada equipo y hasta cuándo.'],
  ['store', 'Direcciones y contacto', 'Los datos de la sucursal que te atiende.'],
]

export default function ClientesLanding() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper text-fore">
      <div className="flex flex-1 items-center justify-center p-5">
        <Card className="w-full max-w-xl space-y-5">
          <div className="flex flex-col items-start gap-3">
            <ThemeLogo className="w-40" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fono-light">Portal de clientes</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Tu cuenta, siempre a mano</h1>
              <p className="mt-2 text-sm leading-6 text-mute">
                Entrá con el <b className="text-fore">enlace personal</b> que te enviamos desde {APP_NAME}. Ahí ves tu saldo,
                tus pedidos, tus garantías y tus comprobantes, sin instalar nada.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {VENTAJAS.map(([icono, titulo, detalle]) => (
              <div key={titulo} className="rounded-xl border border-ink-600 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name={icono} className="h-4 w-4 text-fono-light" />
                  {titulo}
                </p>
                <p className="mt-1 text-xs leading-5 text-mute">{detalle}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-fono/25 bg-fono/5 p-3">
            <p className="text-sm font-medium">¿Todavía no tenés tu enlace?</p>
            <p className="mt-1 text-xs leading-5 text-mute">
              Pedilo en la tienda o por WhatsApp: te lo mandamos al instante. Es personal y de un solo uso por documento;
              si vence, te generamos uno nuevo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link to="/login" className="font-semibold text-fono-light hover:text-fore">Soy de la tienda →</Link>
            <span className="text-mute">·</span>
            <a href="https://moboss.online" className="text-mute hover:text-fore">Conocé {APP_NAME}</a>
          </div>
        </Card>
      </div>
      <ProductFooter />
    </main>
  )
}
