import Icon from '@/components/shared/Icon'
import { Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

// Objetos compartidos por los dos portales públicos del cliente (cuenta por QR
// y vitrina): un solo encabezado con la marca de la tienda, secciones con la
// misma jerarquía y densidad, estados (chip), carga y error. Sin lógica de
// negocio ni datos: solo presentación, para que ambas superficies se vean
// iguales en 360, 768 y 1440.

export function PortalEncabezado({ eyebrow = 'Mi cuenta', titulo, saludo, logoUrl, logoAlt, onLogoError }) {
  return (
    <header className="mb-5 text-center sm:mb-6">
      {logoUrl && (
        <img src={logoUrl} alt={logoAlt || 'Logo de la tienda'} onError={onLogoError} className="mx-auto mb-3 h-12 w-auto max-w-[170px] object-contain sm:mb-4 sm:h-14" />
      )}
      <p className="text-[11px] font-bold uppercase tracking-[.2em] text-fono-light">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
      {saludo && <p className="mt-1 text-sm text-mute">{saludo}</p>}
    </header>
  )
}

export function PortalSeccion({ titulo, icono, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-ink-600 bg-ink-900 p-4 sm:p-5', className)}>
      {titulo && (
        <h2 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
          {icono && <Icon name={icono} className="h-4 w-4 shrink-0 text-fono-light" aria-hidden="true" />}
          {titulo}
        </h2>
      )}
      {children}
    </section>
  )
}

// Chip de estado: un solo objeto para pedidos, entregas y garantías.
export function PortalEstado({ tono = 'info', children, className }) {
  const TONOS = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    info: 'border-fono/25 bg-fono/10 text-fono-light',
    neutro: 'border-ink-500 bg-ink-800 text-mute',
  }
  return <span className={cn('shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', TONOS[tono] || TONOS.info, className)}>{children}</span>
}

export function PortalCargando({ texto = 'Cargando tu cuenta…' }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <Skeleton className="mx-auto h-24 rounded-2xl bg-ink-800/60" />
      <Skeleton className="h-32 rounded-2xl bg-ink-800/60" />
      <p className="text-center text-sm text-mute">{texto}</p>
    </div>
  )
}

export function PortalFallo({ mensaje, ayuda = 'Pedile un enlace nuevo a la tienda que te lo compartió.' }) {
  return (
    <div className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-8 text-center">
      <Icon name="alert" className="mx-auto h-6 w-6 text-bad" />
      <p className="mt-3 text-sm font-medium text-bad">{mensaje}</p>
      <p className="mt-1 text-xs text-mute">{ayuda}</p>
    </div>
  )
}

export function PortalPie({ tienda, actualizado }) {
  return (
    <p className="pt-1 text-center text-[11px] text-mute">
      {actualizado ? `Actualizado ${actualizado} · ` : ''}Documento no fiscal · Generado por MobOS para {tienda || 'la tienda'}
    </p>
  )
}
