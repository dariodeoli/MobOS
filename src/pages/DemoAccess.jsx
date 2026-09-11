import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'

const demoProfiles = [
  {
    name: 'Vendedor',
    pin: '2580',
    description: 'Operá ventas y clientes desde la sucursal asignada.',
    permissions: 'Ventas, productos, stock disponible y seguimiento de clientes.',
  },
  {
    name: 'Dueño',
    pin: '1234',
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

  useEffect(() => {
    if (estado === 'dentro') navigate('/', { replace: true })
  }, [estado, navigate])

  useEffect(() => {
    if (pin.length !== 4 || checking.current) return

    if (!demoProfiles.some((profile) => profile.pin === pin)) {
      setError('PIN incorrecto. Probá 2580 para Vendedor o 1234 para Dueño.')
      return
    }

    checking.current = true
    setBusy(true)
    entrarDemo(pin === '1234' ? 'ADMIN' : 'VENDEDOR')
      .then(() => navigate('/', { replace: true }))
      .catch(() => {
        setError('No pudimos abrir la demo. Intentá nuevamente.')
        setPin('')
        checking.current = false
        setBusy(false)
      })
  }, [pin, entrarDemo, navigate])

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#071018] px-5 py-8 text-white">
      <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1822] shadow-2xl lg:grid-cols-[1fr_430px]">
          <div className="hidden bg-gradient-to-br from-[#10333b] to-[#0b1822] p-10 lg:block">
            <img src="/logo-dark.svg" alt="MobOS" className="h-10" />
            <p className="mt-24 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">
              Demo interactiva
            </p>
            <h1 className="mt-4 text-5xl font-bold leading-tight tracking-[-.05em]">
              Entrá al sistema.
              <br />
              <span className="text-[#15D7B8]">Probá el flujo real.</span>
            </h1>
            <p className="mt-6 max-w-sm leading-7 text-slate-400">
              Usá los mismos menús de MobOS con datos de prueba aislados. Nada se envía a una tienda real.
            </p>
          </div>

          <div className="p-7 sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#15D7B8]/10 text-[#15D7B8]">
              <LockKeyhole size={22} />
            </div>

            <p className="mt-8 text-xs font-bold uppercase tracking-[.18em] text-[#15D7B8]">
              Acceso seguro
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Cuenta demo Tienda MobOS</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Elegí un perfil de prueba y usá su PIN para explorar la aplicación.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {demoProfiles.map((profile) => (
                <article
                  key={profile.name}
                  className="rounded-2xl border border-white/10 bg-[#071018]/70 p-4"
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
                  <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-500">
                    <span className="font-semibold text-slate-300">Permisos:</span> {profile.permissions}
                  </p>
                </article>
              ))}
            </div>

            <label htmlFor="demo-pin" className="mt-8 block text-sm font-semibold">
              Ingresá el PIN del perfil
            </label>
            <input
              id="demo-pin"
              autoFocus
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
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none transition focus:border-[#15D7B8]"
            />

            <p
              id="demo-pin-status"
              role="status"
              className={`mt-3 min-h-5 text-sm ${error ? 'text-red-300' : 'text-slate-500'}`}
            >
              {busy ? 'Abriendo tu tienda demo…' : error || 'Completá 4 dígitos para entrar automáticamente.'}
            </p>

            <div className="mt-6 flex items-center gap-2 rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-3 text-xs text-slate-400">
              <ShieldCheck size={16} className="text-[#15D7B8]" />
              Sesión local · datos aislados
            </div>

            <a
              href="https://controlaria.online"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#15D7B8]"
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
