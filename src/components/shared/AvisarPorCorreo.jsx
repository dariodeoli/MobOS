import { useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { plantillasDemo } from '@/lib/demo/plantillas'
import { armarCorreo, correoValido, mailtoUrl, plantillaCorreoDeEvento } from '@/lib/avisos'
import { useCorreoSaliente } from '@/lib/correoSaliente'
import { solicitarCorreoDemo } from '@/lib/demoCorreo'
import { payloadCorreoDemo } from '@/lib/demoCorreoRequest'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import { Button } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

// «Avisar por correo» en cada cambio de estado (par de WhatsAppMenu): abre el
// programa de correo con el asunto y el texto de la plantilla del evento ya
// elegida. No envía nada solo: la persona revisa y manda. Solo aparece si el
// cliente tiene correo y la empresa tiene correo saliente configurado.
// En la demo, si el cliente tiene correo propio y llega `demoCorreo` (datos
// estructurados del pedido), el correo SE ENVÍA de verdad por el endpoint público
// de la demo (con cuota); apagado o sin red, queda la vista previa de siempre.
export default function AvisarPorCorreo({ email, category = 'ORDERS', evento = '', contexto = {}, title = '', disabled = false, onSent, className, demoCorreo = null }) {
  const { sesion, empresa, sucursal } = useSesion()
  const hayCorreoSaliente = useCorreoSaliente()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [vista, setVista] = useState(null)
  const [envio, setEnvio] = useState(null)

  // La demo no tiene correos reales: usa una casilla ficticia y muestra el
  // mensaje armado en vez de abrir el programa de correo.
  const destino = isDemoRuntime && !correoValido(email) ? 'cliente@ejemplo.com' : email
  if (!correoValido(destino) || !hayCorreoSaliente || !evento) return null

  const valores = {
    empresa: empresa?.nombre || '',
    sucursal: sucursal?.nombre || '',
    usuario: sesion?.nombre || '',
    vendedor: sesion?.nombre || '',
    ...contexto,
  }

  async function abrir() {
    if (ocupado || disabled) return
    setOcupado(true); setError('')
    try {
      const lista = isDemoRuntime ? plantillasDemo(category, 'email') : await api.get(`/api/message-templates?category=${encodeURIComponent(category)}&channel=email`)
      const plantilla = plantillaCorreoDeEvento(lista, evento)
      if (!plantilla) { setError('No hay plantilla de correo activa para este aviso.'); return }
      const armado = armarCorreo(plantilla, valores)
      const url = mailtoUrl(destino, armado)
      if (onSent) await onSent({ template: plantilla, subject: armado.asunto, message: armado.cuerpo, url })
      if (isDemoRuntime) {
        setVista({ ...armado, para: destino, url })
        // Nunca se envía a la casilla ficticia de relleno: solo a un correo cargado en el cliente.
        if (demoCorreo?.kind && correoValido(email)) {
          setEnvio({ estado: 'enviando' })
          const payload = payloadCorreoDemo({ ...demoCorreo, email, cliente: demoCorreo.cliente || title })
          solicitarCorreoDemo(payload).then(({ resultado, aviso }) => setEnvio({ ...resultado, aviso }))
        } else setEnvio(null)
      }
      else if (url) window.open(url, '_self')
    } catch (cause) {
      setError(cause?.message || 'No se pudo preparar el correo.')
    } finally { setOcupado(false) }
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <button
        type="button"
        disabled={disabled || ocupado}
        aria-label={title ? `Avisar por correo a ${title}` : 'Avisar por correo'}
        title={error || 'Abrir el correo con la plantilla de este aviso'}
        data-testid="avisar-correo"
        onClick={(event) => { event.stopPropagation(); abrir() }}
        className={cn('grid h-11 w-11 place-items-center rounded-lg transition', disabled || ocupado ? 'cursor-not-allowed text-mute' : 'text-fono-light hover:bg-fono/10')}
      >
        <Icon name="mail" className="h-4 w-4" />
      </button>
      {error && <span role="alert" className="ml-1 text-[11px] text-bad">{error}</span>}
      <Popup
        open={vista !== null}
        onClose={() => { setVista(null); setEnvio(null) }}
        title="Correo preparado"
        tamano="md"
        footer={(
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost" onClick={() => { setVista(null); setEnvio(null) }}>Cerrar</Button>
            {vista?.url && <Button type="button" onClick={() => { window.open(vista.url, '_self'); setVista(null) }}>Abrir en mi correo</Button>}
          </div>
        )}
      >
        <div className="space-y-2 text-sm" data-testid="correo-vista">
          <p><span className="text-mute">Para: </span>{vista?.para}</p>
          <p><span className="text-mute">Asunto: </span><b>{vista?.asunto}</b></p>
          <p className="whitespace-pre-wrap break-words rounded-xl border border-ink-600 bg-ink-800/40 p-3">{vista?.cuerpo}</p>
          {envio?.estado === 'enviando' && <p role="status" data-testid="correo-demo-estado" className="text-sm text-mute">Enviando el correo…</p>}
          {envio?.estado === 'enviado' && <p role="status" data-testid="correo-demo-estado" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm font-semibold">{envio.aviso?.titulo}<span className="block text-xs font-normal text-mute">{envio.aviso?.detalle}</span></p>}
          {envio?.estado === 'rechazado' && <p role="alert" data-testid="correo-demo-estado" className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm font-semibold">{envio.aviso?.titulo}<span className="block text-xs font-normal">{envio.aviso?.detalle}</span></p>}
          {envio?.estado !== 'enviado' && envio?.estado !== 'enviando' && <p className="text-xs text-mute">Demo: no se envía nada. En una empresa real se abre tu programa de correo con este texto para que lo revises y lo mandes.</p>}
        </div>
      </Popup>
    </span>
  )
}
