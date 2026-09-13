import { APP_NAME } from '@/lib/brand'

export default function AuthLayout({ children }) {
  return (
    <main className="relative min-h-[calc(100dvh-44px)] overflow-x-hidden bg-[#071018] text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" />
      <div className="auth-shell-grid mx-auto grid min-h-[calc(100dvh-44px)] max-w-[1380px] items-center gap-12 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:px-12 lg:py-10">
        <section className="hidden lg:block">
          <img src="/logo-dark.svg" alt={APP_NAME} className="h-12 w-auto" />
          <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">Sistema operativo para tiendas móviles</p>
          <h1 className="mt-4 max-w-xl text-5xl font-bold leading-[.94] tracking-[-.06em] xl:text-6xl">Vendé rápido.<br /><span className="text-[#15D7B8]">Controlá mejor.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-400 xl:text-lg xl:leading-8">POS, stock, caja y clientes conectados en una sola operación para que tu equipo se mueva con claridad.</p>
        </section>
        {children}
      </div>
    </main>
  )
}
