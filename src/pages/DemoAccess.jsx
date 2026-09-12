import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'

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
      navigate('/', { replace: true })
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
      .then(() => navigate('/', { replace: true }))
      .catch(() => {
        setError('No pudimos abrir la demo. Intentá nuevamente.')
        setPin('')
        checking.current = false
        setBusy(false)
      })
  }, [pin, entrarDemo, navigate])

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#071018] px-4 py-4 text-white sm:px-5 sm:py-6">
      <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100dvh-3rem)]">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b1822] shadow-2xl lg:grid-cols-[1fr_410px]">
          <div className="hidden bg-gradient-to-br from-[#10333b] to-[#0b1822] p-8 lg:block xl:p-10">
            <img src="/logo-dark.svg" alt="MobOS" className="h-10" />
            <p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8] xl:mt-20">
              Demo interactiva
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-[-.05em] xl:text-5xl">
              Entrá al sistema.
              <br />
              <span className="text-[#15D7B8]">Probá el flujo real.</span>
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-slate-400">
              Usá los mismos menús de MobOS con datos de prueba aislados. Nada se envía a una tienda real.
            </p>
          </div>

          <div className="p-5 sm:p-7 lg:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15D7B8]/10 text-[#15D7B8]">
                <LockKeyhole size={19} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#15D7B8]">Demo interactiva</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">Tienda MobOS</h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-5 text-slate-400">
              Elegí un perfil y entrá directo. Todo queda guardado solo en este navegador.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {demoProfiles.map((profile) => (
                <button
                  type="button"
                  key={profile.name}
                  disabled={busy}
                  onClick={() => abrirPerfil(profile)}
                  className="rounded-2xl border border-white/10 bg-[#071018]/70 p-4 text-left transition hover:border-[#15D7B8]/60 hover:bg-[#15D7B8]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15D7B8] disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">{profile.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{profile.description}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#15D7B8]/10 px-2 py-1 font-mono text-sm font-bold tracking-widest text-[#15D7B8]">
                      {profile.pin}
                    </span>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#15D7B8]">
                    {busy ? 'Abriendo…' : `Entrar como ${profile.name}`} <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>

            <details className="mt-4 rounded-xl border border-white/10 bg-[#071018]/50 p-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300 marker:hidden">
                <span className="inline-flex items-center gap-2"><KeyRound size={14} className="text-[#15D7B8]" /> Ingresar otro PIN</span>
              </summary>
              <label htmlFor="demo-pin" className="mt-3 block text-xs font-semibold text-slate-300">PIN del perfil</label>
              <input
                id="demo-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                disabled={busy}
                onChange={(event) => {
                  setError('')
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
                }}
                aria-describedby="demo-pin-status"
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#071018] p-3 text-center text-2xl tracking-[.45em] outline-none transition focus:border-[#15D7B8]"
              />
              <p id="demo-pin-status" role="status" className={`mt-2 min-h-4 text-xs ${error ? 'text-red-300' : 'text-slate-500'}`}>
                {busy ? 'Abriendo tu tienda demo…' : error || '2001: Vendedor · 3001: Dueño. Con 4 dígitos entrás automáticamente.'}
              </p>
            </details>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-2.5 text-xs text-slate-400">
              <ShieldCheck size={16} className="text-[#15D7B8]" />
              Sesión local · datos aislados
            </div>

            <a
              href={publicUrls.landing}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#15D7B8]"
            >
              Volver a la landing
              <ArrowRight size={15} />
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
