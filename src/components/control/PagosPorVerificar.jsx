import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { useUrlState } from '@/hooks/useUrlState'
import { formatGs } from '@/utils/moneda'
import { fechaHora } from '@/utils/fecha'
import { obligatorio } from 'owncoding-ui/utils'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { antiguedadTexto, puedeVerificarPagos } from '@/lib/verificacionPagos'
import { demoPagosPorVerificar, demoResolverPago } from '@/lib/demoVerificacionPagos'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import PopupConfirmar from '@/components/shared/PopupConfirmar'
import BarraGestion from '@/components/shared/BarraGestion'
import ComprobanteMiniatura from '@/components/shared/ComprobanteMiniatura'
import { Aviso, Badge, Button, Card, EmptyState, FormField, Skeleton, Textarea, useToast, useValidacionCampos } from '@/components/ui'

const ESTADOS = [
  ['pending', 'Por verificar'],
  ['approved', 'Aprobados'],
  ['rejected', 'Rechazados'],
]
const TONO_ESTADO = { PENDING: ['Pendiente de verificación', 'orange'], CONFIRMED: ['Aprobado', 'green'], REJECTED: ['Rechazado', 'red'] }

// Autorizaciones › Pagos: cobros PIX, USDT o transferencia que esperan que
// alguien confirme que la plata llegó. El servidor decide quién puede aprobar
// (nadie aprueba su propio cobro salvo configuración) y muestra el error claro
// si se intenta igual.
export default function PagosPorVerificar({ onConteo }) {
  const { usuario, esDemo } = useSesion()
  const toast = useToast()
  const [estado, setEstado] = useUrlState('pago', 'pending')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aprobar, setAprobar] = useState(null)
  const [rechazar, setRechazar] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [errorRechazo, setErrorRechazo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const { errorDe, validar, limpiar } = useValidacionCampos({ motivo: [obligatorio('Contale al vendedor por qué se rechaza el pago.')] })
  const pedido = useRef(0)
  const verifica = puedeVerificarPagos(usuario?.role)

  const cargar = useCallback(async () => {
    const turno = ++pedido.current
    setCargando(true)
    setError('')
    try {
      const respuesta = esDemo ? demoPagosPorVerificar(estado) : await api.get(`/api/payments/verification?state=${encodeURIComponent(estado)}`, { cacheMs: 0 })
      if (turno !== pedido.current) return
      setDatos(respuesta)
      onConteo?.(respuesta.counts?.pending?.count ?? 0)
    } catch (cause) {
      if (turno === pedido.current) setError(cause?.message || 'No se pudieron cargar los pagos.')
    } finally {
      if (turno === pedido.current) setCargando(false)
    }
  }, [esDemo, estado, onConteo])

  useEffect(() => { cargar() }, [cargar])
  // Al volver a la pestaña del navegador se vuelve a leer: otro verificador pudo resolver mientras tanto.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [cargar])

  async function confirmarAprobar() {
    if (!aprobar || ocupado) return
    setOcupado(true)
    setError('')
    try {
      if (esDemo) demoResolverPago(aprobar.id, 'approve')
      else await api.patch(`/api/payments/${encodeURIComponent(aprobar.id)}/reconciliation`, { state: 'VERIFIED' })
      toast.success('Pago aprobado', esDemo ? 'En la demo queda simulado.' : 'El vendedor recibe el aviso y el pedido puede entregarse.')
      setAprobar(null)
      cargar()
    } catch (cause) {
      const mensaje = cause?.message || 'No se pudo aprobar el pago.'
      setError(mensaje)
      toast.error('No se pudo aprobar', mensaje)
      setAprobar(null)
      cargar()
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarRechazar() {
    if (!rechazar || ocupado) return
    if (!validar({ motivo }).valido) return
    setOcupado(true)
    setErrorRechazo('')
    try {
      if (esDemo) demoResolverPago(rechazar.id, 'reject', motivo)
      else await api.patch(`/api/payments/${encodeURIComponent(rechazar.id)}/reconciliation`, { state: 'REJECTED', note: motivo.trim() })
      toast.success('Pago rechazado', 'El vendedor ve el motivo en el pedido.')
      setRechazar(null)
      cargar()
    } catch (cause) {
      setErrorRechazo(cause?.message || 'No se pudo rechazar el pago.')
    } finally {
      setOcupado(false)
    }
  }

  const items = datos?.items || []
  const conteos = datos?.counts
  const opciones = ESTADOS.map(([clave, etiqueta]) => [clave, conteos ? `${etiqueta} (${conteos[clave]?.count ?? 0})` : etiqueta])

  return (
    <div className="space-y-3" data-testid="pagos-por-verificar">
      <BarraGestion
        etiqueta="Pagos por verificar"
        testId="barra-pagos-verificar"
        tabs={opciones}
        tab={estado}
        onTab={setEstado}
        etiquetaTabs="Filtrar pagos por estado"
        primary={<Button type="button" variant="outline" className="px-3 text-xs" onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Actualizar'}</Button>}
      />
      {esDemo && <Aviso tono="warn">Datos ficticios: los pagos y comprobantes son de ejemplo y aprobar o rechazar queda simulado.</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      {cargando && !datos && (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      )}
      {datos && !items.length && !error && (
        <Card>
          <EmptyState
            compact
            icon="check"
            title={estado === 'pending' ? 'No hay pagos por verificar' : estado === 'approved' ? 'Todavía no hay pagos aprobados' : 'No hay pagos rechazados'}
            description="Los cobros por PIX, USDT o transferencia aparecen acá apenas se registran, con su comprobante."
          />
        </Card>
      )}
      <ul className="grid gap-3 lg:grid-cols-2" aria-label="Pagos">
        {items.map(item => (
          <TarjetaPago
            key={item.id}
            item={item}
            verifica={verifica}
            esDemo={esDemo}
            onAprobar={() => { setError(''); setAprobar(item) }}
            onRechazar={() => { setMotivo(''); setErrorRechazo(''); limpiar('motivo'); setRechazar(item) }}
          />
        ))}
      </ul>

      <PopupConfirmar
        open={Boolean(aprobar)}
        onCancel={() => { if (!ocupado) setAprobar(null) }}
        onConfirm={confirmarAprobar}
        busy={ocupado}
        title="Aprobar el pago"
        description={aprobar ? `Confirmás que ${formatGs(aprobar.amountPyg)} (${PAYMENT_METHOD_LABELS[aprobar.method] || aprobar.method}) del pedido ${aprobar.orderNumber} ya llegó a la cuenta. El pedido pasa a contar este cobro.` : ''}
        confirmLabel="Aprobar pago"
      />

      <Popup
        open={Boolean(rechazar)}
        onClose={() => { if (!ocupado) setRechazar(null) }}
        dirty={Boolean(rechazar) && motivo.trim() !== ''}
        busy={ocupado}
        title="Rechazar el pago"
        acciones={{
          secundaria: { label: 'Cancelar', disabled: ocupado, cierra: true },
          peligro: { label: ocupado ? 'Guardando…' : 'Rechazar pago', disabled: ocupado, onClick: confirmarRechazar },
        }}
      >
        {rechazar && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              Pedido {rechazar.orderNumber} · {rechazar.customerName || 'Consumidor final'}: <b className="text-fore">{formatGs(rechazar.amountPyg)}</b> por {PAYMENT_METHOD_LABELS[rechazar.method] || rechazar.method}.
            </p>
            <FormField label="Motivo del rechazo" htmlFor="pago-rechazo-motivo" error={errorDe('motivo')}>
              <Textarea
                id="pago-rechazo-motivo"
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={event => { limpiar('motivo'); setMotivo(event.target.value) }}
                placeholder="Ej.: el monto del comprobante no coincide con el banco…"
              />
            </FormField>
            {errorRechazo && <Aviso tono="error" compact>{errorRechazo}</Aviso>}
          </div>
        )}
      </Popup>
    </div>
  )
}

function TarjetaPago({ item, verifica, esDemo, onAprobar, onRechazar }) {
  const [textoEstado, tono] = TONO_ESTADO[item.status] || [item.status, 'slate']
  const cuenta = item.account || {}
  const detalleCuenta = [cuenta.name, cuenta.bank && cuenta.bank !== cuenta.name ? cuenta.bank : '', cuenta.holder, cuenta.alias || cuenta.pixKey].filter(Boolean).join(' · ')
  const pendiente = item.status === 'PENDING'
  const proofs = item.proofs || []
  return (
    <li data-testid="pago-verificar-tarjeta" data-estado={item.status} className="list-none">
      <Card className={pendiente ? 'border-warn/30' : undefined}>
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 flex-col gap-1.5">
            {proofs.slice(0, 2).map(proof => <ComprobanteMiniatura key={proof.id} paymentId={item.id} proof={proof} tamano="h-20 w-20" />)}
            {!proofs.length && (
              <span className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-warn/50 px-1 text-center text-[11px] font-semibold text-warn">Sin comprobante</span>
            )}
            {proofs.length > 2 && <span className="text-center text-[11px] text-mute">+{proofs.length - 2} más</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-lg font-bold tabular-nums" data-testid="pago-verificar-monto">{formatGs(item.amountPyg)}</span>
              <Badge color="blue">{PAYMENT_METHOD_LABELS[item.method] || item.method}</Badge>
              <Badge color={tono}>{textoEstado}</Badge>
              <span className="ml-auto text-xs text-mute" title={fechaHora(item.createdAt)}>{antiguedadTexto(item.ageMinutes)}</span>
            </div>
            <p className="break-words text-xs text-mute">Destino: <b className="text-fore">{detalleCuenta || 'Sin cuenta'}</b></p>
            {item.reference && <p className="break-words text-xs text-mute">Referencia: <b className="text-fore">{item.reference}</b></p>}
            <p className="text-xs text-mute">
              Pedido{' '}
              {esDemo ? <b className="text-fore">{item.orderNumber}</b> : <Link className="font-semibold text-fono-light hover:underline" to={`/pedidos/${item.orderId}`}>{item.orderNumber}</Link>}
              {' · '}{item.customerName || 'Consumidor final'}
            </p>
            <p className="text-xs text-mute">Vendedor: <b className="text-fore">{item.sellerName || '—'}</b>{item.collectedByName && item.collectedByName !== item.sellerName ? <> · cobró <b className="text-fore">{item.collectedByName}</b></> : null}</p>
            {item.resolution && (
              <p className={`text-xs ${item.status === 'REJECTED' ? 'text-bad' : 'text-ok'}`}>
                {item.status === 'REJECTED' ? 'Rechazado' : 'Aprobado'}{item.resolution.byName ? ` por ${item.resolution.byName}` : ''}{item.resolution.at ? ` · ${fechaHora(item.resolution.at)}` : ''}
                {item.resolution.note ? ` · Motivo: ${item.resolution.note}` : ''}
              </p>
            )}
          </div>
        </div>
        {pendiente && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-ink-600 pt-3">
            {item.canResolve ? (
              <>
                <Button type="button" variant="ghost" className="min-h-11 px-4" onClick={onRechazar}>Rechazar</Button>
                <Button type="button" className="min-h-11 px-4" onClick={onAprobar}><Icon name="check" className="h-4 w-4" />Aprobar</Button>
              </>
            ) : (
              <p className="flex-1 text-xs text-mute" data-testid="pago-verificar-propio">
                {verifica ? 'Es tu cobro: lo tiene que aprobar otra persona.' : 'Esperando que gerencia o caja lo verifique.'}
              </p>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}
