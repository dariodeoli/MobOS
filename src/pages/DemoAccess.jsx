import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'
import { PinInput } from '@/components/ui'
import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import Icon from '@/components/shared/Icon'
import { PuntosDemo } from '@/components/app/ComoFuncionaDemo'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

const demoProfiles = [
  {
    name: 'Vendedor',
    pin: '2001',
    description: 'Operá ventas y clientes desde la sucursal asignada.',
    permissions: 'Ventas, productos, stock disponible y seguimiento de clientes.',
  },
  {
    name: 'Dueño',
    pin: '3001',
    description: 'Revisá la operación completa de tu tienda demo.',
    permissions: 'Panel general, ventas, stock, caja, compras, garantías y usuarios.',
  },
]

export default function DemoAccess() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const checking = useRef(false)
  const { entrarDemo, estado } = useSesion()
  const navigate = useNavigate()

  async function abrirPerfil(profile) {
    if (busy) return
    setError('')
    setPin(profile.pin)
    checking.current = true
    setBusy(true)
    try {
      await entrarDemo(profile.pin === '3001' ? 'ADMIN' : 'VENDEDOR')
      // Recarga completa: el modo demo se resuelve al cargar la app (así una
      // entrada desde un redirect sin sesión también queda en modo demo).
      window.location.assign('/')
    } catch {
      checking.current = false
      setBusy(false)
      setPin('')
      setError('No pudimos abrir la demo. Intentá nuevamente.')
    }
  }

  useEffect(() => {
    if (estado === 'dentro') navigate('/', { replace: true })
  }, [estado, navigate])

  useEffect(() => {
    if (pin.length !== 4 || checking.current) return

    if (!demoProfiles.some((profile) => profile.pin === pin)) {
      setError('PIN incorrecto. Probá 2001 para Vendedor o 3001 para Dueño.')
      return
    }

    checking.current = true
    setBusy(true)
    entrarDemo(pin === '3001' ? 'ADMIN' : 'VENDEDOR')
      .then(() => window.location.assign('/'))
      .catch(() => {
        setError('No pudimos abrir la demo. Intentá nuevamente.')
        setPin('')
        checking.current = false
        setBusy(false)
      })
  }, [pin, entrarDemo])

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-paper px-4 py-4 text-fore md:h-dvh md:overflow-hidden sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-fono/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100dvh-4.75rem)] max-w-6xl items-center justify-center md:h-[calc(100dvh-2.5rem)] md:min-h-0">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-fore/10 bg-ink shadow-2xl lg:grid-cols-[1fr_410px]">
          <div className="hidden bg-gradient-to-br from-fono-dark/25 to-ink p-8 lg:block xl:p-10">
            <ThemeLogo className="h-10" />
            <p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-fono-dark xl:mt-20">
              Demo interactiva
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-[-.05em] xl:text-5xl">
              Entrá al sistema.
              <br />
              <span className="text-fono-dark">Probá el flujo real.</span>
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-mute">
              Usá los mismos menús de MobOS con <b className="text-fore">datos ficticios</b> aislados. Nada se envía a una tienda real.
            </p>
          </div>

          <div className="p-5 sm:p-7 lg:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fono-dark/10 text-fono-dark">
                <LockKeyhole size={19} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-fono-dark">Demo interactiva</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">Tienda MobOS</h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-5 text-mute">
              Elegí un perfil y entrá directo. Todo queda guardado solo en este navegador.
            </p>

            <div className={cn('mt-5 lg:grid-cols-1 xl:grid-cols-2', GRILLA_DOS_COLUMNAS)}>
              {demoProfiles.map((profile) => (
                <button
                  type="button"
                  key={profile.name}
                  disabled={busy}
                  onClick={() => abrirPerfil(profile)}
                  className="rounded-2xl border border-fore/10 bg-paper/70 p-4 text-left transition hover:border-fono-dark/60 hover:bg-fono-dark/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-fore">{profile.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-mute">{profile.description}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-fono-dark/10 px-2 py-1 font-mono text-sm font-bold tracking-widest text-fono-dark">
                      {profile.pin}
                    </span>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-fono-dark">
                    {busy ? 'Abriendo…' : `Entrar como ${profile.name}`} <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>

            <details className="mt-4 rounded-xl border border-fore/10 bg-paper/50 p-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-mute marker:hidden">
                <span className="inline-flex items-center gap-2"><Icon name="info" className="h-3.5 w-3.5 text-fono-dark" /> Cómo funciona la demo</span>
              </summary>
              <PuntosDemo className="mt-3" />
            </details>

            <details className="mt-4 rounded-xl border border-fore/10 bg-paper/50 p-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-mute marker:hidden">
                <span className="inline-flex items-center gap-2"><KeyRound size={14} className="text-fono-dark" /> Ingresar otro PIN</span>
              </summary>
              <label htmlFor="demo-pin" className="mt-3 block text-xs font-semibold text-mute">PIN del perfil</label>
              <PinInput
                id="demo-pin"
                value={pin}
                onChange={(next) => { setError(''); setPin(next) }}
                className="mt-2 disabled:opacity-50"
                ariaLabel="PIN del perfil"
              />
              <p id="demo-pin-status" role="status" className={`mt-2 min-h-4 text-center text-xs ${error ? 'text-bad' : 'text-mute'}`}>
                {busy ? 'Abriendo tu tienda demo…' : error || '2001: Vendedor · 3001: Dueño. Con 4 dígitos entrás automáticamente.'}
              </p>
            </details>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-fono-dark/20 bg-fono-dark/5 p-2.5 text-xs text-mute">
              <ShieldCheck size={16} className="text-fono-dark" />
              Sesión local · datos ficticios
            </div>

            <a
              href={publicUrls.landing}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-fono-dark"
            >
              Volver a la landing
              <ArrowRight size={15} />
            </a>
            <p className="mt-3 text-xs text-mute">
              ¿Ya tenés tu tienda?{' '}
              <Link to="/login" className="font-semibold text-fono-dark hover:underline">
                Ingresar con mi cuenta
              </Link>
            </p>
          </div>
        </section>
      </div>
      <ProductFooter />
    </main>
  )
}
