import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'

export default function DemoAccess() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const checking = useRef(false)
  const { entrarDemo, estado } = useSesion()
  const navigate = useNavigate()
  useEffect(() => { if (estado === 'dentro') navigate('/', { replace: true }) }, [estado, navigate])
  useEffect(() => {
    if (pin.length !== 4 || checking.current) return
    if (pin !== '2580') { setError('Código incorrecto. Probá con 2580.'); return }
    checking.current = true
    setBusy(true)
    entrarDemo().then(() => navigate('/', { replace: true })).catch(() => {
      setError('No pudimos abrir la demo. Intentá nuevamente.')
      setPin('')
      checking.current = false
      setBusy(false)
    })
  }, [pin, entrarDemo, navigate])
  return <main className="relative min-h-dvh overflow-hidden bg-[#071018] px-5 py-8 text-white"><div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" /><div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl items-center justify-center"><section className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1822] shadow-2xl lg:grid-cols-[1fr_390px]"><div className="hidden bg-gradient-to-br from-[#10333b] to-[#0b1822] p-10 lg:block"><img src="/logo-dark.svg" alt="MobOS" className="h-10" /><p className="mt-24 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">Demo interactiva</p><h1 className="mt-4 text-5xl font-bold leading-tight tracking-[-.05em]">Entrá al sistema.<br /><span className="text-[#15D7B8]">Probá el flujo real.</span></h1><p className="mt-6 max-w-sm leading-7 text-slate-400">Usá los mismos menús de MobOS con datos de prueba aislados. Nada se envía a una tienda real.</p></div><div className="p-7 sm:p-10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#15D7B8]/10 text-[#15D7B8]"><LockKeyhole size={22} /></div><p className="mt-8 text-xs font-bold uppercase tracking-[.18em] text-[#15D7B8]">Acceso seguro</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Usuario demo</h2><p className="mt-2 text-sm leading-6 text-slate-400">Explorá ventas, stock y los apartados reales de la aplicación.</p><label htmlFor="demo-pin" className="mt-8 block text-sm font-semibold">Ingresá tu PIN demo</label><p className="mt-2 text-sm font-semibold text-[#15D7B8]">PIN demo: 2580</p><input id="demo-pin" autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} disabled={busy} onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)) }} className="mt-3 w-full rounded-xl border border-white/10 bg-[#071018] p-4 text-center text-3xl tracking-[.5em] outline-none transition focus:border-[#15D7B8]" /><p role="status" className={`mt-3 min-h-5 text-sm ${error ? 'text-red-300' : 'text-slate-500'}`}>{busy ? 'Abriendo tu tienda demo…' : error || 'Completá 4 dígitos para entrar automáticamente.'}</p><div className="mt-6 flex items-center gap-2 rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-3 text-xs text-slate-400"><ShieldCheck size={16} className="text-[#15D7B8]" /> Sesión local · datos aislados</div><a href="https://controlaria.online" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#15D7B8]">Volver a la landing <ArrowRight size={15} /></a></div></section></div></main>
}
