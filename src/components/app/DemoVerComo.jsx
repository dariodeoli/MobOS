import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Users } from 'lucide-react'
import { PERFILES_DEMO } from '@/lib/demo/equipo.js'
import { demoSessionRole } from '@/lib/demoMode'
import { cn } from '@/lib/utils'

// «Ver como»: selector de rol SOLO de la demo (el shell lo monta únicamente con
// esDemo). Reutiliza `entrarDemo(rol)` de la sesión demo: no hay otro auth ni
// toca permisos reales. Tras cambiar se recarga en «/» para que el menú, la
// ruta de inicio y los permisos reflejen el rol elegido.
const PORTAL_CLIENTE = '/portal/demo-demo-cliente-lucia-completo'
const SLUG = { ADMIN: 'dueno', TECNICO: 'tecnico' }

function useCambiarRol(entrarDemo) {
  const [busy, setBusy] = useState(false)
  const actual = demoSessionRole()
  async function cambiar(rol) {
    if (busy || rol === actual) return
    setBusy(true)
    try {
      await entrarDemo(rol)
      window.location.assign('/')
    } catch (error) {
      console.error('[demo] no se pudo cambiar de rol:', error)
      setBusy(false)
    }
  }
  return { actual, busy, cambiar }
}

function Opcion({ perfil, actual, busy, onElegir, role }) {
  const activo = perfil.rol === actual
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? activo : undefined}
      aria-current={!role && activo ? 'true' : undefined}
      disabled={busy}
      data-testid={`demo-vista-${SLUG[perfil.rol] || perfil.rol.toLowerCase()}`}
      onClick={() => onElegir(perfil.rol)}
      className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fore transition hover:bg-ink-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono-dark', activo && 'bg-ink-700 font-semibold')}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{perfil.nombre}</span>
        <span className="block truncate text-xs font-normal text-mute">{perfil.description}</span>
      </span>
      {activo && <Check size={16} aria-hidden="true" className="shrink-0 text-ok" />}
    </button>
  )
}

// Variante desplegable (encabezado del shell).
export default function DemoVerComo({ entrarDemo }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  const boton = useRef(null)
  const { actual, busy, cambiar } = useCambiarRol(entrarDemo)
  const perfilActual = PERFILES_DEMO.find((p) => p.rol === actual) || PERFILES_DEMO[0]
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (event) => { if (event.target instanceof Node && raiz.current?.contains(event.target)) return; setAbierto(false) }
    const escape = (event) => { if (event.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape) }
  }, [abierto])
  return (
    <div ref={raiz} data-testid="demo-perspectivas" className="relative inline-flex">
      <button
        ref={boton}
        type="button"
        data-testid="demo-perspectivas-toggle"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Ver como: ${perfilActual.nombre}`}
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-600 bg-ink px-2.5 text-xs font-semibold text-fore transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono-dark"
      >
        <Users size={16} aria-hidden="true" className="shrink-0" />
        <span className="max-sm:hidden text-mute">Ver como:</span>
        <span data-testid="demo-rol-actual" className="truncate">{perfilActual.nombre}</span>
        <ChevronDown size={14} aria-hidden="true" className={cn('shrink-0 transition', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div role="menu" aria-label="Ver como" data-testid="demo-ver-como-menu" className="absolute right-0 top-full z-40 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-ink-500 bg-paper p-1 shadow-xl">
          {PERFILES_DEMO.map((perfil) => (
            <Opcion key={perfil.rol} perfil={perfil} actual={actual} busy={busy} role="menuitemradio" onElegir={(rol) => { setAbierto(false); cambiar(rol) }} />
          ))}
          <span className="my-1 block h-px bg-ink-600" />
          <a
            role="menuitem"
            data-testid="demo-vista-cliente"
            href={PORTAL_CLIENTE}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAbierto(false)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-fore hover:bg-ink-700"
          >
            <span className="flex-1">Cliente (portal)</span>
            <ExternalLink size={14} aria-hidden="true" className="text-mute" />
          </a>
        </div>
      )}
    </div>
  )
}

// Variante lista (menú de perfil en móvil).
export function DemoVerComoLista({ entrarDemo, alElegir }) {
  const { actual, busy, cambiar } = useCambiarRol(entrarDemo)
  return (
    <div data-testid="demo-ver-como-lista" role="group" aria-label="Ver como" className="flex flex-col gap-0.5 py-1">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-mute">Ver como</p>
      {PERFILES_DEMO.map((perfil) => (
        <Opcion key={perfil.rol} perfil={perfil} actual={actual} busy={busy} onElegir={(rol) => { alElegir?.(); cambiar(rol) }} />
      ))}
    </div>
  )
}
