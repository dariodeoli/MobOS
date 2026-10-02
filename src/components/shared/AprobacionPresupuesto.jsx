import { useEffect, useRef, useState } from 'react'
import { API_URL } from '@/lib/api/client'
import { Aviso, Input, Nota } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { codigoPedido } from '@/utils/pedido'
import { PIE_ACCIONES } from '@/components/shared/formulario'

// A3 (#279) · Aprobación autenticada del presupuesto desde el enlace público.
// El cliente revisa la versión congelada, pide un código (correo/teléfono),
// lo confirma y recién ahí se genera el pedido. La firma dibujada es opcional:
// no autentica por sí sola.
const PASOS = { CERRADO: 'CERRADO', CANAL: 'CANAL', CODIGO: 'CODIGO', LISTO: 'LISTO' }
const LARGO_HASH = 12

/** Lienzo de firma opcional: trazo del dedo/mouse, se exporta como PNG. */
function FirmaCanvas({ onChange }) {
  const ref = useRef(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const ancho = canvas.clientWidth || 320
    canvas.width = ancho * ratio
    canvas.height = 160 * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#166534'
  }, [])

  const punto = (event) => {
    const rect = ref.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const empezar = (event) => {
    dibujando.current = true
    const ctx = ref.current.getContext('2d')
    const { x, y } = punto(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const mover = (event) => {
    if (!dibujando.current) return
    const ctx = ref.current.getContext('2d')
    const { x, y } = punto(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    setVacio(false)
  }
  const terminar = () => {
    if (!dibujando.current) return
    dibujando.current = false
    if (ref.current) onChange(ref.current.toDataURL('image/png'))
  }
  const limpiar = () => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setVacio(true)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={ref}
        data-testid="aprobacion-firma-canvas"
        className="h-40 w-full touch-none rounded-xl border border-ink-600 bg-ink-800"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-mute">Opcional: dibujá tu firma con el dedo o el mouse.</p>
        {!vacio && <button type="button" onClick={limpiar} className="text-xs font-semibold text-mute hover:text-fore">Borrar firma</button>}
      </div>
    </div>
  )
}

export default function AprobacionPresupuesto({ quote, token, demo, onAprobada }) {
  const [paso, setPaso] = useState(PASOS.CERRADO)
  const [canal, setCanal] = useState('EMAIL')
  const [challenge, setChallenge] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState(quote?.customerName || '')
  const [documento, setDocumento] = useState('')
  const [firmaVisible, setFirmaVisible] = useState(false)
  const [firma, setFirma] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const demoHabilitado = Boolean(demo)

  const canales = quote?.otp?.canales || { email: false, phone: false }
  const aprobacion = quote?.approval || null

  useEffect(() => {
    setCanal(canales.email ? 'EMAIL' : 'PHONE')
  }, [canales.email, canales.phone])

  async function pedirCodigo() {
    if (busy) return
    setBusy(true); setError(''); setAviso('')
    try {
      if (demoHabilitado) {
        setChallenge({ challengeId: 'demo', destination: canal === 'PHONE' ? '+595 98*** *** 123' : (quote?.otp?.email || 'demo@ejemplo.com'), enviado: true, motivo: null })
        setAviso('Demo: usá el código 123456. En la tienda real se envía a tu ' + (canal === 'PHONE' ? 'teléfono' : 'correo') + '.')
        setPaso(PASOS.CODIGO)
        return
      }
      const response = await fetch(`${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: canal, version: quote?.version?.number || undefined }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo enviar el código.')
      setChallenge(payload)
      setAviso(payload.enviado
        ? `Te enviamos un código a ${payload.destination}. Vence en 10 minutos.`
        : `${payload.motivo || 'El envío quedó en cola.'} Ingresá el código cuando lo recibas.`)
      setPaso(PASOS.CODIGO)
    } catch (cause) {
      setError(cause?.message || 'No se pudo enviar el código.')
    } finally {
      setBusy(false)
    }
  }

  async function aprobar() {
    if (busy) return
    if (!/^\d{6}$/.test(codigo)) { setError('Ingresá el código de 6 dígitos.'); return }
    setBusy(true); setError('')
    try {
      if (demoHabilitado) {
        if (codigo !== '123456') throw new Error('Código incorrecto. En la demo el código es 123456.')
        const evidencia = { at: new Date().toISOString(), method: canal === 'PHONE' ? 'OTP_PHONE' : 'OTP_EMAIL', destination: challenge?.destination || '', version: quote?.version?.number || 1, versionHash: quote?.version?.hash || 'demo', orderNumber: 'PED-DEMO', signerName: nombre || null, signo: Boolean(firma) }
        onAprobada?.(evidencia)
        setPaso(PASOS.LISTO)
        return
      }
      const response = await fetch(`${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge?.challengeId,
          code: codigo,
          ...(nombre.trim() ? { signerName: nombre.trim() } : {}),
          ...(documento.trim() ? { signerDocument: documento.trim() } : {}),
          ...(firma ? { signature: firma } : {}),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo aprobar la cotización.')
      onAprobada?.(payload.evidence)
      setPaso(PASOS.LISTO)
    } catch (cause) {
      setError(cause?.message || 'No se pudo aprobar la cotización.')
    } finally {
      setBusy(false)
    }
  }

  if (aprobacion || paso === PASOS.LISTO) {
    const evidencia = aprobacion || { at: new Date().toISOString(), method: canal === 'PHONE' ? 'OTP_PHONE' : 'OTP_EMAIL', version: quote?.version?.number, versionHash: quote?.version?.hash, orderNumber: null }
    return (
      <section data-testid="aprobacion-evidencia" className="rounded-2xl border border-ok/40 bg-ok/5 p-5">
        <h2 className="flex items-center justify-center gap-2 text-center font-semibold text-ok"><Icon name="check" className="h-4 w-4" />Presupuesto aprobado</h2>
        <p className="mt-2 text-center text-sm text-mute">
          Aprobaste la versión {evidencia.version ?? '—'} el {new Date(evidencia.at).toLocaleString('es-PY')} con código enviado a {evidencia.destination || 'tu contacto'}.
          {evidencia.orderNumber ? <> Se generó el pedido <b className="text-fore">{codigoPedido(evidencia.orderNumber)}</b>.</> : null}
        </p>
        <p className="mt-2 text-center text-[11px] text-mute">
          Evidencia: {String(evidencia.method || '').replace('OTP_', 'OTP por ').toLowerCase()} · hash {String(evidencia.versionHash || '').slice(0, LARGO_HASH)}…
        </p>
      </section>
    )
  }

  if (!canales.email && !canales.phone) {
    return (
      <section className="rounded-2xl border border-warn/30 bg-warn/5 p-5 text-sm" data-testid="aprobacion-sin-contacto">
        <h2 className="font-semibold">Aprobación con código</h2>
        <p className="mt-2 text-mute">Para aprobar con código necesitamos tu correo o teléfono. Pedile al vendedor que los cargue en tu ficha y volvé a abrir este enlace.</p>
      </section>
    )
  }

  return (
    <section data-testid="aprobacion-otp" className="rounded-2xl border border-fono/30 bg-fono/5 p-5">
      <h2 className="text-center font-semibold">Aprobá este presupuesto</h2>
      <p className="mt-1 text-center text-xs text-mute">
        Revisá la versión {quote?.version?.number ?? 1}{quote?.version?.frozenAt ? ` (congelada el ${new Date(quote.version.frozenAt).toLocaleString('es-PY')})` : ''}: te enviamos un código para confirmar que sos vos y el pedido se genera con lo que ves acá.
      </p>

      {error && <Aviso tono="error" className="mt-3 px-3 py-2 text-sm">{error}</Aviso>}
      {aviso && !error && <Nota className="mt-3 px-3 py-2 text-sm">{aviso}</Nota>}

      {paso === PASOS.CERRADO && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <button type="button" data-testid="aprobacion-abrir" disabled={busy} onClick={() => { setPaso(PASOS.CANAL); setError('') }} className="inline-flex items-center gap-2 rounded-xl bg-ok px-5 py-2.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60">
            <Icon name="lock" className="h-4 w-4" />Aprobar con código
          </button>
          <p className="text-[11px] text-mute">El código llega a tu {canales.email ? 'correo' : 'teléfono'}; vence en 10 minutos y es de un solo uso.</p>
        </div>
      )}

      {paso === PASOS.CANAL && (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-mute">¿Dónde querés recibir el código?</p>
            {canales.email && (
              <label className="flex items-center gap-2 rounded-xl border border-ink-600 px-3 py-2 text-sm">
                <input type="radio" name="canal-otp" data-testid="aprobacion-canal-email" checked={canal === 'EMAIL'} onChange={() => setCanal('EMAIL')} />
                Correo <span className="text-mute">{quote?.otp?.email}</span>
              </label>
            )}
            {canales.phone && (
              <label className="flex items-center gap-2 rounded-xl border border-ink-600 px-3 py-2 text-sm">
                <input type="radio" name="canal-otp" data-testid="aprobacion-canal-phone" checked={canal === 'PHONE'} onChange={() => setCanal('PHONE')} />
                Teléfono <span className="text-mute">{quote?.otp?.phone}</span>
              </label>
            )}
          </div>
          <div className={PIE_ACCIONES}>
            <button type="button" disabled={busy} onClick={() => setPaso(PASOS.CERRADO)} className="rounded-xl border border-ink-500 px-4 py-2 text-sm font-semibold text-mute transition hover:text-fore disabled:opacity-60">Volver</button>
            <button type="button" data-testid="aprobacion-enviar" disabled={busy} onClick={pedirCodigo} className="rounded-xl bg-fono px-4 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60">{busy ? 'Enviando…' : 'Enviar código'}</button>
          </div>
        </div>
      )}

      {paso === PASOS.CODIGO && (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs text-mute">Código de 6 dígitos
              <Input data-testid="aprobacion-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 text-center text-lg font-bold tracking-[.3em]" placeholder="000000" />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-mute">Tu nombre (opcional)
                <Input value={nombre} onChange={(event) => setNombre(event.target.value.slice(0, 120))} className="mt-1.5" placeholder="Nombre y apellido" />
              </label>
              <label className="block text-xs text-mute">Documento (opcional)
                <Input value={documento} onChange={(event) => setDocumento(event.target.value.slice(0, 40))} className="mt-1.5" placeholder="CI o RUC" />
              </label>
            </div>
            <button type="button" data-testid="aprobacion-firma-toggle" onClick={() => setFirmaVisible(v => !v)} className="text-xs font-semibold text-fono-light hover:underline">
              {firmaVisible ? 'Ocultar firma' : 'Agregar firma dibujada (opcional)'}
            </button>
            {firmaVisible && <FirmaCanvas onChange={setFirma} />}
            <p className="text-[11px] text-mute">El código autentica la aprobación; la firma es un agregado visual y no reemplaza la verificación.</p>
          </div>
          <div className={PIE_ACCIONES}>
            <button type="button" disabled={busy} onClick={pedirCodigo} className="rounded-xl border border-ink-500 px-4 py-2 text-sm font-semibold text-mute transition hover:text-fore disabled:opacity-60">{busy ? '…' : 'Reenviar código'}</button>
            <button type="button" data-testid="aprobacion-confirmar" disabled={busy || codigo.length !== 6} onClick={aprobar} className="rounded-xl bg-ok px-4 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60">{busy ? 'Aprobando…' : 'Aprobar y generar pedido'}</button>
          </div>
        </div>
      )}
    </section>
  )
}
