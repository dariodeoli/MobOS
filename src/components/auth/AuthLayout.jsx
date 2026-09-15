import ThemeToggle from '@/components/app/ThemeToggle'
import ThemeLogo from '@/components/app/ThemeLogo'

export default function AuthLayout({ children }) {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-paper text-fore">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-fono/15 blur-3xl" />
      <div className="auth-shell-grid mx-auto grid min-h-dvh max-w-[1380px] items-center gap-12 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:px-12">
        <section className="hidden lg:block">
          <ThemeLogo className="h-12 w-auto" />
          <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Sistema operativo para tiendas móviles</p>
          <h1 className="mt-4 max-w-xl text-5xl font-bold leading-[.94] tracking-[-.06em] xl:text-6xl">Vendé rápido.<br /><span className="text-fono-dark">Controlá mejor.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-mute xl:text-lg xl:leading-8">POS, stock, caja y clientes conectados en una sola operación para que tu equipo se mueva con claridad.</p>
        </section>
        {children}
      </div>
    </main>
  )
}
