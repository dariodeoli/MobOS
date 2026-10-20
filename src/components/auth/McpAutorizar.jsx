import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import LoadingScreen from '@/components/app/LoadingScreen'
import { useSesion } from '@/lib/sesion'
import { publicUrls } from '@/lib/urls'

const REQUEST_PATH = '/api/mcp/authorize'

// The request comes from a provider redirect. Keep it as a path and query only:
// accepting an absolute URL here would let an untrusted provider redirect the
// app (or a logged-in user) to an arbitrary host.
function safeRequestPath(value) {
  const request = String(value || '')
  if (!request.startsWith(`${REQUEST_PATH}?`)) return ''
  // redirect_uri and resource are legitimate HTTPS values inside the query;
  // validate the navigation target itself, not encoded OAuth values.
  if (request.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(request)) return ''
  try {
    const parsed = new URL(request, 'https://mobos.invalid')
    if (parsed.origin !== 'https://mobos.invalid' || parsed.pathname !== REQUEST_PATH) return ''
  } catch {
    return ''
  }
  return request
}

function ErrorPanel({ children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12 text-fore">
      <section className="w-full max-w-md rounded-2xl border border-fore/10 bg-white p-6 text-center shadow-card">
        <div role="alert" className="text-sm font-semibold text-fore">{children}</div>
        <p className="mt-3 text-sm text-mute">
          Volvé a iniciar el proceso desde el proveedor para generar una solicitud nueva.
        </p>
      </section>
    </main>
  )
}

/** Secure bridge from a provider consent request to the MobOS API. */
export default function McpAutorizar() {
  const { estado, esDemo } = useSesion() || {}
  const ubicacion = useLocation()
  const [error, setError] = useState('')

  useEffect(() => {
    if (estado === 'cargando') return

    if (esDemo) {
      setError('La autorización MCP no está disponible en la demo.')
      return
    }

    const request = safeRequestPath(new URLSearchParams(ubicacion.search).get('request'))
    if (!request) {
      setError('Solicitud de autorización inválida.')
      return
    }

    if (estado === 'fuera') {
      const volver = `${ubicacion.pathname}${ubicacion.search}`
      window.location.replace(`/login?volver=${encodeURIComponent(volver)}`)
      return
    }

    if (estado === 'dentro') {
      // VITE_API_URL is a trusted build setting; the query cannot override it.
      const apiOrigin = String(import.meta.env.VITE_API_URL || publicUrls.api).replace(/\/$/, '')
      window.location.replace(`${apiOrigin}${request}`)
    }
  }, [estado, esDemo, ubicacion.pathname, ubicacion.search])

  if (estado === 'cargando') return <LoadingScreen mensaje="Preparando autorización…" />
  if (error) return <ErrorPanel>{error}</ErrorPanel>
  return <LoadingScreen mensaje="Preparando autorización…" />
}

