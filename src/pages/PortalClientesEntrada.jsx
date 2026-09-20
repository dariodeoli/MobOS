import { ArrowRight, Link2, MessageCircle, ShieldCheck } from 'lucide-react'
import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import { publicUrls } from '@/lib/urls'

export default function PortalClientesEntrada() {
  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-paper text-fore">
      <div className="relative flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgb(var(--c-fono-glow)_/_0.18),_transparent_68%)]" />
        <section className="relative w-full max-w-lg rounded-3xl border border-fore/10 bg-ink/90 p-6 shadow-[0_24px_70px_rgb(15_23_42_/_0.12)] backdrop-blur sm:p-9">
          <ThemeLogo className="h-10 w-auto" />
          <p className="mt-9 text-xs font-bold uppercase tracking-[0.18em] text-fono-dark">Portal de clientes</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">Ingresá con el enlace que te enviamos.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-mute">
            Tu tienda te comparte un enlace personal para ver tu cuenta, pedidos, comprobantes y garantías.
          </p>

          <div className="mt-7 grid gap-3">
            <div className="flex gap-3 rounded-2xl border border-fore/10 bg-paper/60 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fono/15 text-fono-dark"><Link2 size={19} aria-hidden="true" /></span>
              <div>
                <h2 className="font-semibold">Abrí tu enlace personal</h2>
                <p className="mt-1 text-sm leading-5 text-mute">Copialo desde WhatsApp, SMS o correo y abrilo en este navegador.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-fore/10 bg-paper/60 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fono/15 text-fono-dark"><ShieldCheck size={19} aria-hidden="true" /></span>
              <div>
                <h2 className="font-semibold">Es privado y seguro</h2>
                <p className="mt-1 text-sm leading-5 text-mute">El acceso funciona únicamente con el enlace único que emitió tu tienda.</p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-fore/10 pt-5">
            <p className="flex items-start gap-2 text-sm leading-6 text-mute"><MessageCircle className="mt-0.5 shrink-0 text-fono-dark" size={17} aria-hidden="true" />¿Necesitás ayuda? Escribile por WhatsApp a la tienda que te envió el enlace.</p>
            <a className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fono-dark transition hover:text-fore" href={publicUrls.landing}>
              Conocé MobOS <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
      <ProductFooter />
    </main>
  )
}
