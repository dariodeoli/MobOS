import { Button, Input, Label, MoneyInput, Select, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SelectorMedioPago from '@/components/shared/SelectorMedioPago'
import NumericKeypad from '@/components/shared/NumericKeypad'
import { cn } from '@/lib/utils'
import { gs } from '@/utils/calculos'
import { capitalizarPrimera } from '@/utils/texto'
import { ENTREGA } from '@/lib/catalog'
import PaymentAccountFields, { updateAccountPayment } from '../PaymentAccountFields'

export default function PasoCobro({
  visible,
  customer,
  venderACredito,
  setVenderACredito,
  creditoDias,
  setCreditoDias,
  cuentas,
  usaCuentas,
  errorCuentas,
  onReintentarCuentas,
  pagos,
  setPagos,
  onAgregarPago,
  guardando,
  guardadoIncompleto,
  descuentoMedioPct,
  descuentoMedioGs,
  subtotal,
  puedeDescontar,
  setDescuento,
  totalGeneral,
  totalPagado,
  pendiente,
  f,
  setF,
  set,
  valido,
  cantTotal,
  ok,
}) {
  return (
    <div className={visible ? 'contents' : 'hidden'}>
      {/* Venta a crédito con control de mora */}
      {Number(customer.creditLimitPyg || 0) > 0 && (
        <div className="rounded-2xl border border-fono/25 bg-fono/5 p-4 md:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-fono" checked={venderACredito} onChange={e => setVenderACredito(e.target.checked)} />
            <span>Vender a crédito — límite {gs(Number(customer.creditLimitPyg))}{customer.creditDays ? ` · plazo estándar ${customer.creditDays} días` : ''}</span>
          </label>
          {venderACredito && (
            <div className="mt-3 flex items-center gap-2">
              <Label htmlFor="plazo-en-dias">Plazo en días</Label>
              <Input id="plazo-en-dias" aria-label="Días de crédito" inputMode="numeric" className="w-24" value={creditoDias} onChange={e => setCreditoDias(e.target.value.replace(/\D/g, ''))} placeholder={String(customer.creditDays ?? 30)} />
              <p className="text-xs text-mute">Vence {new Date(Date.now() + (Number(creditoDias) || Number(customer.creditDays) || 0) * 86400000).toLocaleDateString('es-PY')}. Podés igualmente registrar un adelanto abajo.</p>
            </div>
          )}
        </div>
      )}
      {/* Medio de pago */}
      {cuentas?.length === 0 && (
        <div>
          <Label htmlFor="medio-pago-venta">Medio de pago</Label>
          <SelectorMedioPago
            id="medio-pago-venta"
            value={f.medioPago}
            onChange={v => setF(s => ({ ...s, medioPago: v }))}
          />
        </div>
      )}

      {/* Pagos parciales y combinados */}
      <div className="space-y-3 rounded-2xl border border-fono/30 bg-gradient-to-br from-fono/[.08] to-transparent p-4 md:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-mute">Pagos de esta venta</p>
            <p className="text-[11px] text-mute">
              Podés dividir el cobro entre efectivo, cuentas y transferencias.
            </p>
          </div>
          {descuentoMedioPct > 0 && subtotal > 0 && (
            puedeDescontar ? (
              <button
                type="button"
                onClick={() => setDescuento(String(descuentoMedioGs))}
                className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-left text-xs font-semibold text-warn transition hover:bg-warn/15"
              >
                Aplicar descuento por medio ({descuentoMedioPct}% = {gs(descuentoMedioGs)})
              </button>
            ) : (
              <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                El medio elegido sugiere un descuento del {descuentoMedioPct}% ({gs(descuentoMedioGs)}). Pedí autorización a gerencia para aplicarlo.
              </p>
            )
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onAgregarPago}
            disabled={!cuentas || guardando || guardadoIncompleto}
          >
            + Agregar pago
          </Button>
        </div>
        {!cuentas && !errorCuentas && (
          <p role="status" className="text-sm text-mute">
            Cargando cuentas de cobro…
          </p>
        )}
        {errorCuentas && (
          <div role="alert" className="text-sm text-bad">
            {errorCuentas}
            <Button type="button" variant="ghost" onClick={onReintentarCuentas}>
              Reintentar carga
            </Button>
          </div>
        )}
        {cuentas?.length === 0 && (
          <p className="text-xs text-mute">
            No hay cuentas configuradas. Se habilitaron los medios de pago anteriores.
          </p>
        )}
        {usaCuentas &&
          !cuentas.some(a => a.isActive && ['USD', 'PYG', 'BRL'].includes(a.currency)) && (
            <p role="alert" className="text-sm text-warn">
              No hay cuentas activas en USD o PYG para recibir pagos.
            </p>
          )}
        {pagos.map((p, i) => (
          <div
            key={i}
            className={cn('grid grid-cols-1 gap-2 items-end sm:grid-cols-[1.2fr_1fr_1fr_auto]', !usaCuentas && 'rounded-2xl border border-ink-600 bg-ink-800/30 p-3')}
          >
            {usaCuentas ? (
              <PaymentAccountFields
                payment={p}
                accounts={cuentas}
                onChange={change =>
                  setPagos(a =>
                    a.map((x, j) => (j === i ? updateAccountPayment(x, change, cuentas) : x)),
                  )
                }
              />
            ) : (
              <>
                <div>
                  <Label htmlFor={`medio-pago-${i}`}>Medio</Label>
                  <SelectorMedioPago
                    id={`medio-pago-${i}`}
                    value={p.medioPago}
                    onChange={v =>
                      setPagos(a => a.map((x, j) => (j === i ? { ...x, medioPago: v } : x)))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cuenta">Cuenta</Label>
                  <Input id="cuenta"
                    value={p.cuenta}
                    onChange={e =>
                      setPagos(a =>
                        a.map((x, j) => (j === i ? { ...x, cuenta: e.target.value } : x)),
                      )
                    }
                    placeholder="Ej. Ueno principal"
                  />
                </div>
                <div>
                  <Label htmlFor="monto-gs">Monto (Gs)</Label>
                  <MoneyInput id="monto-gs"
                    value={String(p.monto || '').replace(/\D/g, '')}
                    onValueChange={v =>
                      setPagos(a =>
                        a.map((x, j) => (j === i ? { ...x, monto: v === '' ? '' : String(v) } : x)),
                      )
                    }
                    placeholder="0"
                  />
                  <NumericKeypad
                    value={String(p.monto || '').replace(/\D/g, '')}
                    onChange={v =>
                      setPagos(a => a.map((x, j) => (j === i ? { ...x, monto: v } : x)))
                    }
                  />
                </div>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              aria-label="Quitar este pago"
              onClick={() => setPagos(a => a.filter((_, j) => j !== i))}
            >
              <Icon name="trash" className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2 border-t border-fono/20 pt-3 text-xs text-mute">
          <span className="rounded-xl border border-ink-600 px-3 py-2">Total<strong className="mt-0.5 block text-base tabular-nums text-fore">{gs(totalGeneral)}</strong></span>
          <span className="rounded-xl border border-ok/25 bg-ok/10 px-3 py-2">Pagado<strong className="mt-0.5 block text-base tabular-nums text-ok">{gs(totalPagado)}</strong></span>
          <span className={cn('rounded-xl border px-3 py-2', pendiente ? 'border-warn/25 bg-warn/10' : 'border-ink-600')}>Pendiente<strong className={cn('mt-0.5 block text-base tabular-nums', pendiente ? 'text-warn' : 'text-ok')}>{gs(pendiente)}</strong></span>
        </div>
      </div>

      {/* Entrega + monto envío */}
      <div>
        <Label htmlFor="entrega">Entrega</Label>
        <Select id="entrega" value={f.entrega} onChange={set('entrega')}>
          {ENTREGA.map(x => (
            <option key={x} value={x}>
              {x === 'Delivery'
                ? 'Delivery'
                : x === 'Encomienda'
                  ? 'Envío por encomienda'
                  : 'Retiro en tienda'}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="monto-entrega">
          {f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Monto del delivery (₲)'}
        </Label>
        <MoneyInput
          id="monto-entrega"
          value={f.montoDelivery}
          onValueChange={v => setF(s => ({ ...s, montoDelivery: v }))}
          placeholder="0 si retira en tienda"
          disabled={f.entrega === 'Retiro en tienda'}
        />
      </div>

      {/* Observación */}
      <div className="md:col-span-2">
        <Label htmlFor="observacion">Observación</Label>
        <Textarea id="observacion"
          rows={1}
          value={f.observacion}
          onChange={event => setF(current => ({ ...current, observacion: capitalizarPrimera(event.target.value) }))}
          placeholder="Notas, color, envío vía encomienda, etc."
          autoCapitalize="sentences"
        />
      </div>

      <div className="md:col-span-2 flex items-center gap-3">
        <Button
          type="submit"
          variant="success"
          disabled={
            !valido || guardando || !cuentas || Boolean(errorCuentas) || guardadoIncompleto
          }
          className="sticky bottom-3 min-h-12 flex-1 text-base shadow-lg shadow-fono/10"
        >
          {guardando ? 'Guardando venta…' : 'Guardar venta'}
          {cantTotal > 1 ? ` · ${cantTotal} productos` : ''}
          {totalGeneral > 0 ? ` · ${gs(totalGeneral)}` : ''}
        </Button>
        {ok && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-2 text-ok font-bold text-sm whitespace-nowrap"
          >
            <Icon name="receipt" className="h-4 w-4" /> Recibo confirmado
          </span>
        )}
      </div>
    </div>
  )
}
