import { useState } from 'react'
import { Badge, Button, MenuDesplegable, Money, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { plantillasDemo } from '@/lib/demo/plantillas'
import { armarCorreo, correoValido, mailtoUrl, plantillaCorreoDeEvento } from '@/lib/avisos'
import { useCorreoSaliente } from '@/lib/correoSaliente'
import { canalDe, renderPlantilla } from '@/lib/whatsappPlantillas'
import { whatsappUrl } from '@/utils/telefono'
import { gs } from '@/utils/calculos'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { cn, primerNombre } from '@/lib/utils'
import { DetallePagoVerificacion, EstadoPagoBadge } from '../PagoVerificacion'

const ICONO_MEDIO = { CASH: 'money', DINERO: 'money', TRANSFER: 'transfer', CARD: 'card', CREDIT: 'subscription', STORE_CREDIT: 'wallet', GIFT_CARD: 'wallet', CRYPTO: 'terminal', PIX: 'qr' }
const EVENTO_AVISO_PAGO = 'pago_pendiente'

function nombreCorto(nombre) {
  const corto = primerNombre(String(nombre || '').trim())
  return corto ? corto.charAt(0).toUpperCase() + corto.slice(1) : 'Sistema'
}

// Encabezado de estado del pago, como en Shopify: Pago pendiente · Pagado · Pago parcial · En verificación.
export function estadoDePago({ anulado, estadoPago, pagosPorVerificar = [] }) {
  if (anulado) return { texto: 'Anulado', tono: 'slate' }
  if (estadoPago === 'Pagado') return { texto: 'Pagado', tono: 'green' }
  if (pagosPorVerificar.length > 0) return { texto: 'En verificación', tono: 'orange' }
  if (estadoPago === 'A crédito') return { texto: 'A crédito', tono: 'orange' }
  if (estadoPago === 'Parcial') return { texto: 'Pago parcial', tono: 'orange' }
  return { texto: 'Pago pendiente', tono: 'red' }
}

export default function PedidoPago({
  order, payments = [], total, pagado, pendiente, estado, itemsCantidad = 0, anulado = false, esDemo = false,
  contextoAviso = {}, fechaDe, nombreDe, onCobrar, onPagos, onSubido, onDescargarComprobante,
}) {
  const toast = useToast()
  const hayCorreoSaliente = useCorreoSaliente()
  const [avisando, setAvisando] = useState(false)
  const pagosPorVerificar = payments.filter((pago) => pago.status === 'PENDING')
  const telefono = order.customer?.phone
  const correo = order.customer?.email || order.email
  const descuento = Number(order.discountPyg || 0)
  const envio = Number(order.deliveryPyg || 0)
  const puedeAvisar = pendiente > 0 && !anulado && (Boolean(telefono) || (correoValido(correo) && (hayCorreoSaliente || isDemoRuntime)))

  // «Enviar aviso de pago»: arma el mensaje con la plantilla pago_pendiente y abre
  // WhatsApp o el correo; no envía nada solo (la persona revisa y manda).
  async function enviarAviso(canal) {
    if (avisando) return
    setAvisando(true)
    try {
      const lista = isDemoRuntime || esDemo
        ? plantillasDemo('ORDERS', canal === 'correo' ? 'email' : 'whatsapp')
        : await api.get(`/api/message-templates?category=ORDERS${canal === 'correo' ? '&channel=email' : ''}`)
      if (canal === 'correo') {
        const plantilla = plantillaCorreoDeEvento(lista, EVENTO_AVISO_PAGO)
        if (!plantilla) { toast.error('No hay plantilla de correo para el aviso de pago', 'Activá «Pago pendiente» en Configuración › Plantillas.'); return }
        const url = mailtoUrl(correo, armarCorreo(plantilla, contextoAviso))
        if (url) window.open(url, '_self')
        return
      }
      const plantilla = (Array.isArray(lista) ? lista : []).find((item) => item.key === EVENTO_AVISO_PAGO && item.isActive !== false && canalDe(item) !== 'email')
      if (!plantilla) { toast.error('No hay plantilla de WhatsApp para el aviso de pago', 'Activá «Pago pendiente» en Configuración › Plantillas.'); return }
      const url = whatsappUrl(telefono, renderPlantilla(plantilla.body, contextoAviso), order.customer?.countryCode || '+595')
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      toast.error('No se pudo preparar el aviso de pago', cause?.message || 'Probá de nuevo.')
    } finally { setAvisando(false) }
  }

  const itemsAviso = [
    ...(telefono ? [{ id: 'aviso-whatsapp', label: 'Por WhatsApp', icono: 'send', onClick: () => enviarAviso('whatsapp') }] : []),
    ...(correoValido(correo) && (hayCorreoSaliente || isDemoRuntime) ? [{ id: 'aviso-correo', label: 'Por correo', icono: 'mail', onClick: () => enviarAviso('correo') }] : []),
  ]

  return (
    <section className="ventas-f3-detail-section" data-testid="pedido-pago">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold"><Icon name="wallet" className="h-3.5 w-3.5" /> Pago</h3>
        <Badge data-testid="pedido-pago-estado" color={estado.tono}>{estado.texto}</Badge>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" data-testid="pedido-pago-acciones">
          {!anulado && (
            <MenuDesplegable
              alineacion="right"
              ariaLabel="Más acciones del pago"
              trigger={<span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore"><span className="sr-only">Más acciones del pago</span><Icon name="dots" className="h-4 w-4" /></span>}
              items={[{ id: 'pagos-devoluciones', label: 'Pagos y devoluciones', icono: 'wallet', onClick: onPagos }]}
            />
          )}
          {puedeAvisar && (itemsAviso.length === 1
            ? <Button type="button" variant="outline" disabled={avisando} data-testid="pedido-aviso-pago" onClick={itemsAviso[0].onClick}>Enviar aviso de pago</Button>
            : (
              <MenuDesplegable
                alineacion="right"
                ariaLabel="Enviar aviso de pago"
                trigger={<span data-testid="pedido-aviso-pago" className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-fore">Enviar aviso de pago<Icon name="chevron" className="h-3.5 w-3.5" /></span>}
                items={itemsAviso}
              />
            ))}
          {!anulado && pendiente > 0 && <Button type="button" data-testid="pedido-cobrar" onClick={onCobrar}>Cobrar</Button>}
        </div>
      </div>
      <dl className="mx-3 mb-3 mt-2 max-w-[520px] space-y-1 text-sm" data-testid="pedido-totales-f3">
        <div className="flex justify-between gap-3"><dt className="text-fore">Subtotal</dt><dd className="min-w-0 flex-1 text-mute">{itemsCantidad} artículo{itemsCantidad === 1 ? '' : 's'}</dd><dd className="tabular-nums"><Money value={Number(order.subtotalPyg ?? total)} /></dd></div>
        {descuento > 0 && <div className="flex justify-between gap-3"><dt className="text-fore">Descuento</dt><dd className="min-w-0 flex-1 text-mute">{order.discountReason || order.couponCode || 'Descuento del pedido'}</dd><dd className="tabular-nums text-warn">− <Money value={descuento} /></dd></div>}
        {envio > 0 && <div className="flex justify-between gap-3"><dt className="text-fore">Envío</dt><dd className="min-w-0 flex-1 text-mute">{order.deliveryNotes || 'Delivery'}</dd><dd className="tabular-nums"><Money value={envio} /></dd></div>}
        <div className="flex justify-between gap-3 border-t border-ink-600 pt-1.5 font-semibold"><dt>Total</dt><dd className="min-w-0 flex-1" /><dd className="tabular-nums">{gs(total)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fore">Pagado</dt><dd className="min-w-0 flex-1" /><dd className="tabular-nums text-ok">{gs(pagado)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fore">Saldo</dt><dd className="min-w-0 flex-1 text-mute">{pendiente > 0 && Number(order.creditDays || 0) > 0 ? `Plazo ${order.creditDays} días${order.dueAt ? ` · vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : ''}` : (pendiente > 0 && order.dueAt ? `Vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : '')}</dd><dd className={cn('tabular-nums', pendiente > 0 && 'font-semibold text-warn')}>{gs(pendiente)}</dd></div>
      </dl>
      {payments.length > 0 && (
        <div className="space-y-2 border-t border-ink-600 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Transacciones ({payments.length})</p>
          {payments.map((pago) => {
            const medio = ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method || 'Pago'
            const cuando = fechaDe(pago)
            const quien = nombreDe(pago)
            const comprobante = (pago.proofs || [])[0]
            return (
              <div key={pago.id} data-testid="pedido-transaccion" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-ink-600 text-mute" aria-hidden="true"><Icon name={ICONO_MEDIO[pago.method] || 'money'} className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-fore">{medio}{pago.accountSnapshot?.name ? ` · ${pago.accountSnapshot.name}` : ''}{pago.reference ? ` · ${pago.reference}` : ''}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-mute">{cuando && <span>{cuando}</span>}{quien && <span className="flex items-center gap-1"><PersonaChip user={pago.user || { name: quien }} size="sm" nombre={false} />{nombreCorto(quien)}</span>}{pago.settlesAt && <span>acredita {new Date(pago.settlesAt).toLocaleDateString('es-PY')}</span>}</span>
                  </span>
                </span>
                <EstadoPagoBadge pago={pago} />
                <span className="ml-auto min-w-24 text-right text-sm font-semibold tabular-nums"><Money value={Number(pago.amountPyg || 0)} /></span>
                {comprobante && <button type="button" data-testid="pedido-pago-comprobante" className="inline-flex min-h-11 items-center text-xs font-semibold text-fono-light hover:underline md:min-h-0" onClick={() => onDescargarComprobante(pago.id, comprobante)}>Ver comprobante</button>}
                <DetallePagoVerificacion pago={pago} esDemo={esDemo} onSubido={onSubido} />
              </div>
            )
          })}
          {pagosPorVerificar.length > 0 && <p className="text-[11px] text-warn">«Pagado» suma solo los pagos confirmados; {pagosPorVerificar.length} pago{pagosPorVerificar.length === 1 ? '' : 's'} por verificar ({gs(pagosPorVerificar.reduce((suma, pago) => suma + Number(pago.amountPyg || 0), 0))}) no descuentan el saldo todavía.</p>}
        </div>
      )}
    </section>
  )
}
