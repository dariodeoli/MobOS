import { useState } from 'react'
import { api } from '@/lib/api'
import { estadoVisiblePago, pagoEnVerificacion } from '@/lib/verificacionPagos'
import AttachmentInput from '@/components/shared/AttachmentInput'
import ComprobanteMiniatura from '@/components/shared/ComprobanteMiniatura'
import Icon from '@/components/shared/Icon'
import { Aviso, Badge, Button, useToast } from '@/components/ui'

const SOLO_IMAGENES = 'image/jpeg,image/png,image/webp'

/** Estado del cobro en el pedido: Pendiente de verificación · Aprobado · Rechazado (con el motivo). */
export function EstadoPagoBadge({ pago }) {
  const estado = estadoVisiblePago(pago)
  return <Badge color={estado.tono} data-testid="pago-estado" data-estado={estado.clave}>{estado.label}</Badge>
}

/**
 * Debajo de cada cobro: motivo del rechazo, miniaturas del comprobante y, si el
 * cobro espera verificación y no tiene comprobante, cómo subirlo (cámara o
 * archivo) sin salir del pedido.
 */
export function DetallePagoVerificacion({ pago, esDemo = false, onSubido }) {
  const toast = useToast()
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const estado = estadoVisiblePago(pago)
  const proofs = pago.proofs || []
  const puedeSubir = !esDemo && pagoEnVerificacion(pago) && !proofs.length

  async function subir(file) {
    setSubiendo(true)
    setError('')
    try {
      const cuerpo = new FormData()
      cuerpo.append('file', file)
      await api.post(`/api/payments/${encodeURIComponent(pago.id)}/proofs`, cuerpo)
      toast.success('Comprobante subido', 'Quien verifica ya lo puede ver.')
      await onSubido?.()
    } catch (cause) {
      setError(cause?.message || 'No se pudo subir el comprobante.')
    } finally {
      setSubiendo(false)
    }
  }

  if (!estado.motivo && !proofs.length && !puedeSubir && !error) return null
  return (
    <div className="basis-full space-y-2 pl-9" data-testid="pago-detalle-verificacion">
      {estado.clave === 'rechazado' && estado.motivo && (
        <p className="text-xs text-bad" data-testid="pago-motivo-rechazo">Motivo del rechazo: {estado.motivo}</p>
      )}
      {proofs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {proofs.map(proof => <ComprobanteMiniatura key={proof.id} paymentId={pago.id} proof={proof} tamano="h-14 w-14" />)}
        </div>
      )}
      {puedeSubir && (
        <div className="space-y-1.5" data-testid="pago-subir-comprobante">
          <p className="text-xs text-warn">Falta el comprobante: sin él no se puede verificar el cobro.</p>
          <div className="flex flex-wrap items-center gap-2">
            <AttachmentInput accept={SOLO_IMAGENES} capture="environment" disabled={subiendo} onSelect={subir} onError={setError} aria-label="Sacar foto del comprobante">
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={subiendo}><Icon name="image" className="h-4 w-4" />{subiendo ? 'Subiendo…' : 'Sacar foto'}</Button>
            </AttachmentInput>
            <AttachmentInput disabled={subiendo} onSelect={subir} onError={setError} aria-label="Elegir archivo del comprobante">
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={subiendo}>Elegir archivo</Button>
            </AttachmentInput>
          </div>
        </div>
      )}
      {error && <Aviso tono="error" compact>{error}</Aviso>}
    </div>
  )
}

/** Aviso visible de por qué «Entregar» está deshabilitado. */
export function AvisoEntregaBloqueada({ motivo }) {
  if (!motivo) return null
  return (
    <p role="status" data-testid="entrega-bloqueada" className="mt-2 flex items-start gap-1.5 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-2 text-xs text-warn">
      <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{motivo}</span>
    </p>
  )
}
