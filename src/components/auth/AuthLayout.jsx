import ThemeToggle from '@/components/app/ThemeToggle'
import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import { publicUrls } from '@/lib/urls'
import { cn } from '@/lib/utils'

// Cáscara compartida de las pantallas sin sesión (#282): /login, /demo y las
// recuperaciones usan el mismo panel, encabezado, tipografía y pie, con la
// columna de marca a la izquierda en escritorio. Las variantes se resuelven por
// props (texto de marca y subtítulo), sin duplicar layout.
export default function AuthLayout({
  children,
  eyebrow = 'Sistema operativo para tiendas móviles',
  titulo = null,
  subtitulo = 'POS, stock, caja y clientes conectados en una sola operación para que tu equipo se mueva con claridad.',
  className,
}) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-hidden bg-paper text-fore">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-fono/15 blur-3xl" />
      <div className={cn('auth-shell-grid mx-auto grid w-full max-w-[1380px] flex-1 items-center gap-12 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:px-12', className)}>
        <section className="hidden lg:block">
          <ThemeLogo className="h-12 w-auto" />
          <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-fono-dark">{eyebrow}</p>
          <h1 className="mt-4 max-w-xl text-5xl font-bold leading-[.94] tracking-[-.06em] xl:text-6xl">
            {titulo || <>Vendé rápido.<br /><span className="text-fono-dark">Controlá mejor.</span></>}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-mute xl:text-lg xl:leading-8">{subtitulo}</p>
        </section>
        {children}
      </div>
      <ProductFooter className="shrink-0" />
    </main>
  )
}

/** Panel de acceso: la tarjeta única que comparten login y demo. */
export function AuthPanel({ children, className }) {
  return (
    <section className={cn('login-panel mx-auto w-full max-w-[560px] rounded-[2rem] border border-fore/10 bg-ink/95 p-5 shadow-2xl shadow-fono/5 sm:p-6 lg:p-7', className)}>
      {children}
    </section>
  )
}

/** Encabezado del panel: volver + logo + subtítulo (misma jerarquía siempre). */
export function AuthPanelHeader({ volver = publicUrls.landing, volverLabel = 'Volver al inicio', subtitulo = 'Sistema de ventas para tiendas' }) {
  return (
    <>
      <a href={volver} className="toque-44 mb-4 inline-flex items-center gap-2 text-sm font-semibold text-fono-dark transition hover:text-fore lg:mb-3">← {volverLabel}</a>
      <ThemeLogo className="mb-1 w-48" />
      <p className="mb-5 text-sm text-mute lg:mb-4">{subtitulo}</p>
    </>
  )
}
