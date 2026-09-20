import { Link } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import { enlaceLogin } from '@/lib/urls'

// Estado de un QR de la app que necesita sesión: dice de qué es el código y
// manda al login guardando el destino (`next`) para volver exactamente acá.
export default function AccesoRequerido({ titulo, descripcion, destino }) {
  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-900 p-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-fono/15">
        <Icon name="lock" className="h-5 w-5 text-fono-light" />
      </div>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{titulo}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-mute">{descripcion}</p>
      <Link
        to={enlaceLogin(destino)}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-fono px-5 text-sm font-semibold text-onbrand transition hover:bg-fono-light"
      >
        Iniciar sesión
      </Link>
      <p className="mt-3 text-xs text-mute">Después de entrar volvés a esta página.</p>
    </section>
  )
}
