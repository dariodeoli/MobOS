import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'
import { PinInput } from '@/components/ui'
import { PERFILES_DEMO, perfilDemoPorPin } from '@/lib/demo/equipo.js'
import AuthLayout, { AuthPanel, AuthPanelHeader } from '@/components/auth/AuthLayout'

// #324: la entrada cubre los seis roles ficticios; cada cápsula muestra la
// persona del equipo demo que va a quedar en la sesión (misma fuente que Equipo).
const demoProfiles = PERFILES_DEMO

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
      eyebrow="Demo interactiva"
      titulo={<>Entrá al sistema.<br /><span className="text-fono-dark">Probá el flujo real.</span></>}
      subtitulo="Usá los mismos menús de MobOS con datos ficticios aislados. Nada se envía a una tienda real."
    >
      <AuthPanel className="p-4 sm:p-6 lg:p-7">
        <AuthPanelHeader volver={publicUrls.landing} volverLabel="Volver a la landing" subtitulo="Demo interactiva · datos ficticios" />

        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Elegí un perfil y entrá</h1>
        <p className="mb-3 text-xs leading-5 text-mute sm:mb-4 sm:text-sm">Todo queda guardado solo en este navegador.</p>

        {/* #328: cápsulas compactas en grilla (2 en móvil, 3 en escritorio) para
            que la pantalla entre sin scroll en 390×844; el botón completo es el
            target (≥44px) y el nombre accesible sigue siendo «Entrar como <Rol>». */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {demoProfiles.map((profile) => (
            <button
              type="button"
              key={profile.rol}
              disabled={busy}
              onClick={() => abrirPerfil(profile)}
              aria-label={`Entrar como ${profile.nombre}`}
              title={`${profile.description} ${profile.permissions}`}
              className="min-h-11 rounded-xl border border-fore/10 bg-paper/70 p-2 text-left transition hover:border-fono-dark/60 hover:bg-fono-dark/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-60"
            >
              <span className="flex items-center justify-between gap-1">
                <span className="truncate text-[13px] font-bold leading-5 text-fore">{profile.nombre}</span>
                <span className="shrink-0 rounded-md bg-fono-dark/10 px-1.5 py-px font-mono text-[11px] font-bold tracking-widest text-fono-dark">{profile.pin}</span>
              </span>
              <span className="mt-0.5 block text-[11px] font-medium leading-4 text-mute">{profile.description}</span>
              <span className="block truncate text-[10px] leading-4 text-mute">{profile.persona}</span>
            </button>
          ))}
        </div>

        {/* Ingresar otro PIN: siempre visible, sin colapsar (#235). */}
        <div className="mt-3 rounded-xl border border-fore/10 bg-paper/50 p-2.5">
          <label htmlFor="demo-pin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute">
            <KeyRound size={13} className="text-fono-dark" /> Ingresar otro PIN
          </label>
          <PinInput
            id="demo-pin"
            value={pin}
            onChange={(next) => { setError(''); setPin(next) }}
            className="mt-1.5 h-12 w-40 disabled:opacity-50"
            ariaLabel="Ingresar otro PIN"
          />
          <p id="demo-pin-status" role="status" className={`mt-1.5 min-h-4 text-center text-[11px] ${error ? 'text-bad' : 'text-mute'}`}>
            {busy ? 'Abriendo tu tienda demo…' : error || 'Elegí una cápsula o ingresá el PIN de 4 dígitos.'}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-mute sm:text-xs">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-fono-dark" />
            Sesión local · datos ficticios
          </p>
          <p>
            ¿Ya tenés tu tienda?{' '}
            <Link to="/login" className="toque-44 font-semibold text-fono-dark hover:underline">
              Ingresar con mi cuenta
            </Link>
          </p>
        </div>
      </AuthPanel>
    </AuthLayout>
  )
}
