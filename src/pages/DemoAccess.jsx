import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'
import PinPad from '@/components/shared/PinPad'
import { PERFILES_DEMO, perfilDemoPorPin } from '@/lib/demo/equipo.js'
import AuthLayout, { AuthPanel, AuthPanelHeader } from '@/components/auth/AuthLayout'

// La entrada ofrece Dueño y Vendedor; el resto de roles (PERFILES_DEMO) se
// cambia dentro con «Ver como». Cada tarjeta muestra la persona del equipo demo.
const demoProfiles = PERFILES_DEMO.filter((p) => p.rol === 'ADMIN' || p.rol === 'VENDEDOR')

export default function DemoAccess() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinAbierto, setPinAbierto] = useState(false)
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
      await entrarDemo(profile.pin)
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

    if (!perfilDemoPorPin(pin)) {
      setError('PIN incorrecto. Probá 2001 (Vendedor) o 3001 (Dueño).')
      return
    }

    checking.current = true
    setBusy(true)
    entrarDemo(pin)
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
      compacto
      eyebrow="Demo interactiva"
      titulo={<>Entrá al sistema.<br /><span className="text-fono-dark">Probá el flujo real.</span></>}
      subtitulo="Usá los mismos menús de MobOS con datos ficticios aislados. Nada se envía a una tienda real."
    >
      <AuthPanel className="demo-acceso min-w-0 p-4 sm:p-6 lg:p-7">
        <AuthPanelHeader compacto volver={publicUrls.landing} volverLabel="Volver a la landing" subtitulo="Demo interactiva · datos ficticios" />

        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Elegí un perfil y entrá</h1>
        <p className="mb-3 text-xs leading-5 text-mute sm:mb-4 sm:text-sm">Todo queda guardado solo en este navegador.</p>

        {/* Modo demo: la entrada ofrece SOLO Dueño y Vendedor, grandes y de un
            toque. Los demás roles se eligen adentro con «Ver como» (sin volver
            acá) o con el teclado de PIN, plegado debajo. */}
        <div className="grid w-full min-w-0 gap-2.5 sm:grid-cols-2" data-testid="demo-perfiles">
          {demoProfiles.map((profile) => (
            <button
              type="button"
              key={profile.rol}
              disabled={busy}
              onClick={() => abrirPerfil(profile)}
              aria-label={`Entrar como ${profile.nombre}`}
              title={`${profile.description} ${profile.permissions}`}
              className="min-h-[88px] min-w-0 rounded-2xl border bg-paper/70 p-4 text-left transition hover:border-fono-dark/60 hover:bg-fono-dark/5 [border-color:var(--landing-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-60"
            >
              <span className="block text-lg font-bold leading-6 text-fore">{profile.nombre}</span>
              <span className="mt-0.5 block text-sm font-medium leading-5 text-mute">{profile.description}</span>
              <span className="block truncate text-xs leading-4 text-mute">{profile.persona}</span>
            </button>
          ))}
        </div>

        {/* Ingresar otro PIN: plegado; el teclado grande aparece al tocarlo. */}
        <div className="mt-3 rounded-xl border bg-paper/50 px-3 [border-color:var(--landing-line)]">
          <button
            type="button"
            data-testid="demo-pin-toggle"
            aria-expanded={pinAbierto}
            aria-controls="demo-pin-panel"
            onClick={() => setPinAbierto((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark"
          >
            <span className="inline-flex items-center gap-1.5"><KeyRound size={15} className="text-fono-dark" /> Ingresar otro PIN</span>
            <ChevronDown size={16} aria-hidden="true" className={pinAbierto ? 'rotate-180 transition' : 'transition'} />
          </button>
          <div id="demo-pin-panel" hidden={!pinAbierto} className="pb-2">
            <label htmlFor="demo-pin" className="sr-only">Ingresar otro PIN</label>
            <PinPad
              id="demo-pin"
              discreto
              disabled={busy}
              value={pin}
              onChange={(next) => { setError(''); setPin(next) }}
              className="mt-1" invalido={Boolean(error)}
              ariaLabel="Ingresar otro PIN"
            />
          </div>
          <p id="demo-pin-status" role="status" className={`min-h-4 pb-2 text-center text-xs ${error ? 'text-bad' : 'text-mute'}`}>
            {busy ? <><span aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] motion-reduce:animate-none" />Abriendo tu tienda demo…</> : error || 'Los demás roles se eligen adentro con «Ver como».'}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-mute">
          <p className="hidden items-center gap-1.5 sm:inline-flex">
            <ShieldCheck size={14} className="text-fono-dark" />
            Sesión local · datos ficticios
          </p>
          <p>
            ¿Ya tenés tu tienda?{' '}
            <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-fono-dark hover:underline">
              Ingresar con mi cuenta
            </Link>
          </p>
        </div>
      </AuthPanel>
    </AuthLayout>
  )
}
