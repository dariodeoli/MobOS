import { useCallback, useEffect, useState } from 'react'
import { Aviso, Button, ConfirmDialog, Input, Label, Modal, MoneyInput, Select, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { resources } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { gs } from '@/utils/calculos'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { estadoGiftCard } from '@/lib/giftCards'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

// Gift cards desde el POS (#280): emisión con código (se muestra una sola vez),
// listado con saldo y el historial de cada tarjeta. El canje vive en el cobro.
const MOVIMIENTOS = { ISSUE: 'Emitida', REDEEM: 'Canjeada', CANCEL: 'Anulada' }

function fechaCorta(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
}

export default function GiftCardsPos({ open, onClose, cuentas = [], customer = null }) {
  const { sesion, esDemo } = useSesion()
  const puedeAnular = Boolean(sesion?.esPropietario || ['ADMIN', 'GERENTE', 'dueno'].includes(sesion?.rol))
  const [tarjetas, setTarjetas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [monto, setMonto] = useState('')
  const [vence, setVence] = useState('')
  const [accountId, setAccountId] = useState('')
  const [asociar, setAsociar] = useState(Boolean(customer?.id))
  const [nota, setNota] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitida, setEmitida] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [anular, setAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const cuentasActivas = (cuentas || []).filter((cuenta) => cuenta.isActive)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const filas = await resources.giftCards.list()
      setTarjetas(Array.isArray(filas) ? filas : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las gift cards.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setEmitida(null)
    setDetalle(null)
    setCopiado(false)
    cargar()
  }, [open, cargar])

  useEffect(() => { setAsociar(Boolean(customer?.id)) }, [customer?.id, open])

  async function emitir(event) {
    event.preventDefault()
    if (emitiendo) return
    setEmitiendo(true)
    setError('')
    setEmitida(null)
    try {
      const creada = await resources.giftCards.issue({
        amountPyg: Number(String(monto).replace(/\D/g, '')) || 0,
        ...(asociar && customer?.id ? { customerId: customer.id, customerName: customer.name || '' } : {}),
        ...(vence ? { expiresAt: new Date(`${vence}T23:59:59`).toISOString() } : {}),
        ...(accountId ? { accountId } : {}),
        ...(nota.trim() ? { note: nota.trim() } : {}),
      })
      if (!creada?.code) throw new Error('No se recibió el código de la gift card.')
      setEmitida(creada)
      setMonto('')
      setVence('')
      setNota('')
      cargar()
    } catch (cause) {
      setError(cause?.message || 'No se pudo emitir la gift card.')
    } finally {
      setEmitiendo(false)
    }
  }

  async function abrirDetalle(tarjeta) {
    if (detalle?.id === tarjeta.id) { setDetalle(null); return }
    setCargandoDetalle(true)
    setError('')
    try {
      setDetalle(await resources.giftCards.get(tarjeta.id))
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar el historial.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  async function confirmarAnulacion() {
    if (!anular || anulando) return
    setAnulando(true)
    setError('')
    try {
      await resources.giftCards.cancel(anular.id)
      setAnular(null)
      setDetalle(null)
      await cargar()
    } catch (cause) {
      setError(cause?.message || 'No se pudo anular la gift card.')
    } finally {
      setAnulando(false)
    }
  }

  function copiarCodigo() {
    if (!emitida?.code) return
    copiarAlPortapapeles(emitida.code).then((ok) => {
      setCopiado(ok)
      if (ok) setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Gift cards" size="amplio">
      <div className="space-y-4" data-testid="gift-cards-modal">
        {error && <Aviso tono="error" className="rounded-xl">{error}</Aviso>}

        {emitida ? (
          <section className="rounded-2xl border border-ok/40 bg-ok/10 p-4" data-testid="gift-card-emitida">
            <p className="text-sm font-semibold text-ok">Gift card emitida · {gs(Number(emitida.amountPyg))}</p>
            <p className="mt-1 text-xs text-mute">Este código se muestra una sola vez: anotalo o compartilo antes de cerrar.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-xl border border-ok/30 bg-ink-900 px-3 py-2 font-mono text-base font-bold tracking-wider text-fono-light" data-testid="gift-card-codigo">{emitida.code}</code>
              <Button type="button" variant="outline" onClick={copiarCodigo}><Icon name="copy" className="h-4 w-4" />{copiado ? 'Copiado' : 'Copiar código'}</Button>
              <Button type="button" variant="ghost" onClick={() => setEmitida(null)}>Emitir otra</Button>
            </div>
          </section>
        ) : (
          <form onSubmit={emitir} className="space-y-3 rounded-2xl border border-ink-600 p-4">
            <p className="text-sm font-semibold">Emitir gift card</p>
            <div className={GRILLA_DOS_COLUMNAS}>
              <div>
                <Label htmlFor="gc-monto">Monto (₲)</Label>
                <MoneyInput id="gc-monto" required max={LIMITE_MONTO_VENTAS} value={monto} onValueChange={setMonto} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="gc-vence">Vence (opcional)</Label>
                <Input id="gc-vence" type="date" value={vence} onChange={(event) => setVence(event.target.value)} />
              </div>
              {cuentasActivas.length > 0 && (
                <div>
                  <Label htmlFor="gc-cuenta">Cuenta que cobra la emisión</Label>
                  <Select id="gc-cuenta" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">Sin cuenta (queda en el historial)</option>
                    {cuentasActivas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.name} · {cuenta.currency}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="gc-nota">Nota (opcional)</Label>
                <Input id="gc-nota" maxLength={300} value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Regalo, campaña…" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-fono" checked={asociar} disabled={!customer?.id} onChange={(event) => setAsociar(event.target.checked)} />
              Asociar al cliente de esta venta{customer?.name ? ` (${customer.name})` : ' (sin cliente seleccionado)'}
            </label>
            {esDemo && <p className="text-xs text-mute">Demo: la gift card vive en este navegador y no toca una tienda real.</p>}
            <Button type="submit" disabled={emitiendo || !String(monto).replace(/\D/g, '')}>{emitiendo ? 'Emitiendo…' : 'Emitir gift card'}</Button>
          </form>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-mute">Últimas gift cards</h3>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={cargar} disabled={cargando}>Actualizar</Button>
          </div>
          {cargando && !tarjetas.length && <Skeleton className="h-16 w-full rounded-xl" />}
          {!cargando && !tarjetas.length && <p className="text-sm text-mute">Todavía no hay gift cards emitidas.</p>}
          <div className="space-y-1.5">
            {tarjetas.map((tarjeta) => {
              const estado = estadoGiftCard(tarjeta)
              const abierta = detalle?.id === tarjeta.id
              return (
                <div key={tarjeta.id} data-testid="gift-card-fila" className={cn('rounded-xl border border-ink-600 bg-ink-800/40', abierta && 'border-fono/40')}>
                  <button type="button" onClick={() => abrirDetalle(tarjeta)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-left">
                    <span className="min-w-0">
                      <b className="block font-mono text-xs text-fono-light">GC ••••{tarjeta.codeLast4}</b>
                      <span className="mt-0.5 block truncate text-[11px] text-mute">{tarjeta.customer?.name || 'Sin cliente'} · {fechaCorta(tarjeta.createdAt)}</span>
                    </span>
                    <span className="text-right">
                      <b className={cn('block text-sm tabular-nums', Number(tarjeta.balancePyg) > 0 ? 'text-fore' : 'text-mute')}>{gs(Number(tarjeta.balancePyg))}</b>
                      <span className={cn('text-[10.5px] font-semibold', estado === 'Activa' ? 'text-ok' : estado === 'Anulada' ? 'text-bad' : 'text-warn')}>{estado} · de {gs(Number(tarjeta.amountPyg))}</span>
                    </span>
                  </button>
                  {abierta && (
                    <div className="border-t border-ink-600 px-3.5 py-2" data-testid="gift-card-historial">
                      {cargandoDetalle && <Skeleton className="h-10 w-full" />}
                      {!cargandoDetalle && (
                        <>
                          <ol className="space-y-1.5">
                            {(detalle.movements || []).map((movimiento) => (
                              <li key={movimiento.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
                                <span>
                                  <b className={movimiento.kind === 'REDEEM' ? 'text-fore' : 'text-fono-light'}>{MOVIMIENTOS[movimiento.kind] || movimiento.kind}</b>
                                  {' · '}{fechaCorta(movimiento.createdAt)}
                                  {movimiento.order?.orderNumber ? ` · Pedido ${movimiento.order.orderNumber}` : ''}
                                  {movimiento.accountSnapshot?.name ? ` · ${movimiento.accountSnapshot.name}` : ''}
                                </span>
                                <span className="tabular-nums">{gs(Number(movimiento.amountPyg))} → {gs(Number(movimiento.balanceAfterPyg))}</span>
                              </li>
                            ))}
                          </ol>
                          {!detalle.movements?.length && <p className="text-xs text-mute">Sin movimientos.</p>}
                          {puedeAnular && tarjeta.status === 'ACTIVE' && (
                            <div className="mt-2 flex justify-end">
                              <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-warn" onClick={() => setAnular(tarjeta)}>Anular saldo restante</Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(anular)}
        onCancel={() => setAnular(null)}
        onConfirm={confirmarAnulacion}
        title="Anular la gift card"
        description={`El saldo restante de GC ••••${anular?.codeLast4 || ''} no se va a poder canjear. La operación queda en el historial y la auditoría.`}
        confirmLabel={anulando ? 'Anulando…' : 'Anular gift card'}
      />
    </Modal>
  )
}
