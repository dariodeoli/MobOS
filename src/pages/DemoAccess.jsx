import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'
import { PinInput } from '@/components/ui'
import AuthLayout, { AuthPanel, AuthPanelHeader } from '@/components/auth/AuthLayout'

const demoProfiles = [
  {
    name: 'Vendedor',
    pin: '2001',
    description: 'Ventas y clientes.',
    permissions: 'Ventas, productos, stock disponible y seguimiento de clientes.',
  },
  {
    name: 'Dueño',
    pin: '3001',
    description: 'Operación completa.',
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
    <AuthLayout
      eyebrow="Demo interactiva"
      titulo={<>Entrá al sistema.<br /><span className="text-fono-dark">Probá el flujo real.</span></>}
      subtitulo="Usá los mismos menús de MobOS con datos ficticios aislados. Nada se envía a una tienda real."
    >
      <AuthPanel>
        <AuthPanelHeader volver={publicUrls.landing} volverLabel="Volver a la landing" subtitulo="Demo interactiva · datos ficticios" />

        <h1 className="mb-1 text-2xl font-semibold sm:text-[1.7rem]">Elegí un perfil y entrá</h1>
        <p className="mb-5 text-sm leading-6 text-mute">Todo queda guardado solo en este navegador.</p>

        <div className="space-y-3">
          {demoProfiles.map((profile) => (
            <button
              type="button"
              key={profile.name}
              disabled={busy}
              onClick={() => abrirPerfil(profile)}
              className="w-full rounded-2xl border border-fore/10 bg-paper/70 p-4 text-left transition hover:border-fono-dark/60 hover:bg-fono-dark/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-fore">{profile.name}</h2>
                  <p className="mt-1 text-xs leading-5 text-mute">{profile.description}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-fono-dark/10 px-2 py-1 font-mono text-sm font-bold tracking-widest text-fono-dark">
                  {profile.pin}
                </span>
              </div>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fono-dark">
                {busy ? 'Abriendo…' : `Entrar como ${profile.name}`} <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>

        {/* Ingresar otro PIN: siempre visible, sin colapsar (#235). */}
        <div className="mt-4 rounded-xl border border-fore/10 bg-paper/50 p-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-mute">
            <KeyRound size={14} className="text-fono-dark" /> Ingresar otro PIN
          </p>
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
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-fono-dark/20 bg-fono-dark/5 p-2.5 text-xs text-mute">
          <ShieldCheck size={16} className="text-fono-dark" />
          Sesión local · datos ficticios
        </div>

        <p className="mt-4 text-sm text-mute">
          ¿Ya tenés tu tienda?{' '}
          <Link to="/login" className="toque-44 font-semibold text-fono-dark hover:underline">
            Ingresar con mi cuenta
          </Link>
        </p>
      </AuthPanel>
    </AuthLayout>
  )
}
