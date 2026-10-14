import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { api } from '@/lib/api'
import ThemeLogo from '@/components/app/ThemeLogo'
import CodigoSegmentado from '@/components/shared/CodigoSegmentado'

// Segundo factor del panel de plataforma: el dueño ya pasó la verificación de
// Google; acá ingresa su PIN personal (el mismo de la app). Valida solo al
// completar los dígitos (también al pegar el código entero).
export default function PinPantalla({ largo = 4, onVerificado }) {
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  async function verificar(valor) {
    setEnviando(true); setError('')
    try {
      await api.post('/api/superadmin/pin', { pin: valor }, { timeoutMs: 15000 })
      if (vivo.current) onVerificado()
    } catch (e) {
      if (!vivo.current) return
      setError(e?.status === 422 && Number.isFinite(e?.details?.restantes)
        ? `PIN incorrecto. Te quedan ${e.details.restantes} ${e.details.restantes === 1 ? 'intento' : 'intentos'}.`
        : e?.message || 'No se pudo verificar el PIN.')
      setPin(''); setEnviando(false)
      setTimeout(() => document.querySelector('[data-testid="codigo-celda-0"]')?.focus(), 0)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-4 text-fore" data-testid="superadmin-pin">
      <form
        onSubmit={e => { e.preventDefault(); if (pin.length === largo && !enviando) verificar(pin) }}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-ink-600 bg-ink-800 p-6 text-center"
      >
        <ThemeLogo className="mx-auto h-7 w-auto" />
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-fono-soft text-fono-dark dark:text-fono"><Lock className="h-5 w-5" aria-hidden="true" /></div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Ingresá tu PIN</h1>
          <p className="text-sm text-mute">Es el PIN personal de {largo} dígitos que usás en la app.</p>
        </div>
        <div className="flex justify-center">
          <CodigoSegmentado
            id="superadmin-pin"
            value={pin}
            onChange={setPin}
            onComplete={verificar}
            grupos={[largo]}
            alfabeto="numerico"
            enmascarar
            autoFocus
            disabled={enviando}
            ariaLabel="PIN"
            mensajeIncompleto=" "
            className="text-left"
          />
        </div>
        <p role="alert" className="min-h-5 text-sm text-bad" data-testid="superadmin-pin-error">{error}</p>
        <button type="submit" disabled={pin.length !== largo || enviando} className="min-h-11 w-full rounded-lg bg-fono-dark px-4 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? 'Verificando…' : 'Entrar'}
        </button>
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-mute hover:underline">Volver a la app</Link>
      </form>
    </main>
  )
}
