import { useNavigate } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import { Button } from '@/components/ui'

// Módulo que la app de iPhone todavía no incluye (ver MODULOS_IOS). Se llega
// por un enlace o un aviso. Ofrece volver a Vender; el enlace a la web solo se
// muestra si el módulo no es de pagos/precios.
export default function ProximamenteIOS({ nombre, urlWeb }) {
  const navigate = useNavigate()
  return (
    <section data-testid="ios-proximamente" className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-700 text-fono-light"><Icon name="info" className="h-7 w-7" /></span>
      <h1 className="text-xl font-semibold">Disponible pronto en la app</h1>
      <p className="text-sm leading-6 text-mute">{nombre ? `${nombre} todavía no está en la app de iPhone.` : 'Esta sección todavía no está en la app de iPhone.'} Mientras tanto, la usás desde moboss.online.</p>
      <Button onClick={() => navigate('/pos', { replace: true })} className="min-h-11">Volver a Vender</Button>
      {urlWeb && <a href={urlWeb} target="_blank" rel="noopener noreferrer" data-testid="ios-proximamente-web" className="inline-flex min-h-11 items-center text-sm font-semibold text-fono-light underline">Abrir en la web</a>}
    </section>
  )
}
