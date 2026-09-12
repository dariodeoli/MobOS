export function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0">
      <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.909c1.703-1.568 2.683-3.878 2.683-6.615Z" />
      <path fill="#4285F4" d="M9 18c2.43 0 4.467-.806 5.957-2.18l-2.91-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.037-3.71H.956v2.331A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.712A5.412 5.412 0 0 1 3.681 9c0-.594.102-1.171.282-1.712V4.957H.956A9 9 0 0 0 0 9c0 1.452.348 2.827.956 4.043l3.007-2.331Z" />
      <path fill="#34A853" d="M9 3.578c1.322 0 2.508.454 3.441 1.345l2.581-2.582C13.463.891 11.426 0 9 0A9 9 0 0 0 .956 4.957l3.007 2.331C4.672 5.162 6.656 3.578 9 3.578Z" />
    </svg>
  )
}

export function OAuthDivider() {
  return <div className="flex items-center gap-3 py-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500"><span className="h-px flex-1 bg-white/10" />o continuá con<span className="h-px flex-1 bg-white/10" /></div>
}

export default function GoogleButton({ create = false, busy = false, onClick }) {
  const label = create ? 'Crear con Google' : 'Continuar con Google'
  return (
    <button type="button" onClick={onClick} disabled={busy} className="group relative flex h-10 w-full items-center justify-center rounded-lg border border-white/15 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-px hover:border-white hover:bg-slate-50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15D7B8] disabled:cursor-wait disabled:opacity-70">
      {busy ? <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-slate-300 border-t-[#4285F4]" /> : <GoogleMark />}
      <span className="ml-3">{busy ? 'Conectando con Google…' : label}</span>
      {!busy && <span aria-hidden="true" className="absolute right-4 text-base text-slate-400 transition-transform group-hover:translate-x-0.5">→</span>}
    </button>
  )
}
