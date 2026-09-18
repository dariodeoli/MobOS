import { useEffect, useState } from 'react'
import ThemeLogo from '@/components/app/ThemeLogo'
import { APP_NAME } from '@/lib/brand'
import { getCompanyContext } from '@/lib/api'
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { cn } from '@/lib/utils'

// Pantalla de carga de la app: logo institucional, línea de progreso animada y,
// cuando ya hay contexto de empresa (autenticado o sesión cacheada), el logo y
// el nombre de la tienda en un chip discreto. Sin emojis: solo Icon/imágenes.
export default function LoadingScreen({ mensaje = 'Cargando tu tienda…', className }) {
  const [empresa, setEmpresa] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [logo, setLogo] = useState('')

  useEffect(() => {
    const contexto = getCompanyContext()
    if (!contexto?.tenant) return undefined
    setEmpresa(contexto.tenant)
    setPerfil(contexto.profile || null)
    let activo = true
    getLogoDataUrl().then((url) => { if (activo && url) setLogo(url) })
    return () => { activo = false }
  }, [])

  const imagenEmpresa = logo || perfil?.picture || ''
  const nombreEmpresa = empresa?.name || ''

  return (
    <div className={cn('relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-paper px-6 text-fore', className)} role="status" aria-busy="true" aria-label={mensaje} data-testid="pagina-cargando">
      {/* Halo de marca: da profundidad sin competir con el logo. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-[62%] rounded-full bg-fono/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fono/50 to-transparent" />

      <div className="relative flex w-full max-w-xs flex-col items-center">
        <ThemeLogo className="w-40 drop-shadow-[0_10px_30px_rgba(12,136,118,0.25)] motion-safe:animate-[mobos-respira_2.6s_ease-in-out_infinite]" />

        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[.22em] text-mute">{mensaje}</p>

        {/* Línea de carga indeterminada: el tramo de marca recorre el riel. */}
        <div className="mt-4 h-[3px] w-44 overflow-hidden rounded-full bg-ink-600/70" aria-hidden>
          <span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-fono/40 via-fono to-fono-light motion-safe:animate-[mobos-carga_1.25s_ease-in-out_infinite]" />
        </div>
      </div>

      {nombreEmpresa && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center px-6">
          <span className="flex max-w-[22rem] items-center gap-2.5 rounded-full border border-fore/10 bg-ink-800/70 px-3 py-1.5 shadow-card backdrop-blur">
            {imagenEmpresa ? (
              <img src={imagenEmpresa} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fono/15 text-[10px] font-bold text-fono-light">{nombreEmpresa.charAt(0).toUpperCase()}</span>
            )}
            <span className="min-w-0 truncate text-xs font-semibold">{nombreEmpresa}</span>
            <span className="shrink-0 rounded-full border border-ink-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mute">{APP_NAME}</span>
          </span>
        </div>
      )}
    </div>
  )
}
