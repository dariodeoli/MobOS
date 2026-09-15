import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { consumeActionToken } from '@/lib/actionToken'
import { Card } from '@/components/ui'

export default function VerificarCorreo() {
  const [token] = useState(() => consumeActionToken())
  const [state, setState] = useState({ loading: true, error: '', message: '' })
  useEffect(() => {
    let active = true
    api.post('/api/auth/email-verification/verify', { token }).then(result => active && setState({ loading: false, error: '', message: result.message })).catch(cause => active && setState({ loading: false, error: cause?.message || 'No se pudo verificar el correo.', message: '' }))
    return () => { active = false }
  }, [token])
  return <main className="flex min-h-dvh items-center justify-center bg-[#071018] p-5 text-white"><Card className="w-full max-w-md border-white/10 bg-[#0b1822]"><img src="/logo-dark.svg" alt="MobOS" className="w-40" /><h1 className="mt-6 text-2xl font-bold">Verificación de correo</h1>{state.loading && <p role="status" className="mt-4 text-sm text-mute">Verificando el enlace…</p>}{state.error && <p role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{state.error}</p>}{state.message && <p role="status" className="mt-4 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{state.message}</p>}<Link to="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-fono-light hover:text-white">Ir al acceso</Link></Card></main>
}
