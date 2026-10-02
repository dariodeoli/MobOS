import { Aviso, Button, Input, Label, MoneyInput, Nota, Select, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SelectorMedioPago from '@/components/shared/SelectorMedioPago'
import NumericKeypad from '@/components/shared/NumericKeypad'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import { gs } from '@/utils/calculos'
import { capitalizarPrimera } from '@/utils/texto'
import { ENTREGA } from '@/lib/catalog'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { puedeCanjearGiftCard } from '@/lib/validacionGlobal'
import PaymentAccountFields from '../PaymentAccountFields'
import { updateAccountPayment } from '@/utils/pagoCuenta'
import EncabezadoBloque from './EncabezadoBloque'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

// Cómo se paga y cómo se entrega, en la misma pantalla que el resto de la
// venta. Cierra con el botón que guarda, pegado al pie para no perderse al
// completar los pagos.
export default function PasoCobro({
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
  onAgregarGiftCard,
  onConsultarGiftCard,
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
  valido,
  motivos = [],
  cantTotal,
  ok,
  pendientes = [],
  onElegirUnidad,
  onSobrePedido,
  onTransito,
  onIrAlCarrito,
}) {
  // El botón principal dice qué se está por crear según lo cobrado: verde si
  // está pago, naranja si es parcial y rojo si queda pendiente/a crédito.
  const pagoCompleto = totalGeneral > 0 && totalPagado >= totalGeneral
  const sinPago = totalPagado <= 0
  // Segundo renglón del botón: productos e importe (#148 §5/§11).
  const detalleBoton = [
    cantTotal > 1 ? `${cantTotal} productos` : '',
    totalGeneral > 0 ? gs(totalGeneral) : '',
  ].filter(Boolean).join(' · ')
  // #308: con el carrito vacío no se cobra (pagos/gift cards bloqueados).
  const sinProductos = cantTotal === 0
  // #297: tampoco se carga un cobro cuando el total es Gs 0 (producto sin
  // precio): no hay nada que pagar y el saldo quedaría en contra.
  const sinTotal = totalGeneral <= 0
  // #297: canjear necesita un total mayor a cero y saldo pendiente real.
  const puedeCanjear = puedeCanjearGiftCard({ cantTotal, totalGeneral, pendiente })
  const motivoGiftCard = sinProductos
    ? 'Agregá productos a la venta para canjear gift cards.'
    : totalGeneral <= 0
      ? 'Cargá un producto con precio para canjear gift cards.'
      : 'No queda saldo pendiente por cobrar en esta venta.'
  const motivoPago = sinProductos ? 'Agregá productos a la venta para cargar pagos.' : 'Cargá un producto con precio para cargar pagos.'
  const etiquetaBoton = guardando
    ? 'Guardando venta…'
    : !valido
      ? 'Guardar pedido'
      : pagoCompleto
        ? 'Confirmar venta'
        : sinPago
          ? (venderACredito ? 'Crear pedido a crédito' : 'Crear pedido sin pago')
          : 'Crear pedido'
  const clasesBoton = cn(
    // Cabecera en su renglón y productos/importe abajo: el botón no parte el
    // importe en dos líneas (#148 §5/§11). Más alto y con más aire que el
    // botón estándar.
    'h-auto min-h-14 min-w-0 px-5 py-3 shadow-lg shadow-fono/10',
    // AA (#241): sobre ok/bad/warn el texto sigue el tema (blanco sobre el
    // verde/rojo/ámbar oscuro del claro; negro sobre los tonos claros del
    // oscuro).
    pagoCompleto && 'text-white dark:text-black',
    sinPago && 'text-white dark:text-black',
    // Parcial (#148 §5/§11): naranja de atención, no el azul primario.
    !pagoCompleto && !sinPago && 'bg-warn text-white dark:text-black hover:brightness-110',
  )
  // Un solo botón para los dos lugares (escritorio y barra fija del celular).
  function BotonGuardar({ className }) {
    return (
      <Button
        type="submit"
        variant={pagoCompleto ? 'success' : sinPago ? 'danger' : 'primary'}
        className={cn(clasesBoton, className)}
        disabled={!valido || guardando || !cuentas || Boolean(errorCuentas) || guardadoIncompleto}
        title={motivos[0] || undefined}
      >
        <span className="flex flex-col items-center gap-0.5 leading-tight">
          <span className="text-[15px] font-bold">{etiquetaBoton}</span>
          {detalleBoton && <span className="text-xs font-semibold tabular-nums opacity-95 whitespace-nowrap">{detalleBoton}</span>}
        </span>
      </Button>
    )
  }
  return (
    <section
      data-testid="pos-cobro"
      className={cn(
        'space-y-3.5 rounded-2xl border border-ink-600 bg-ink-800 p-3.5 shadow-card',
        // Lenguaje v2 (#241, paso 5): el bloque de cobro detrás del flag.
        temaV2Activo() && 'tema-v2',
      )}
    >
      <EncabezadoBloque
        titulo="Cobro y entrega"
        descripcion="Dividí el cobro entre cuentas, elegí la entrega y guardá la venta."
      />

      {/* Venta a crédito con control de mora */}
      {Number(customer.creditLimitPyg || 0) > 0 && (
        <div className="rounded-2xl border border-fono/25 bg-fono/5 p-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-fono"
              checked={venderACredito}
              onChange={e => setVenderACredito(e.target.checked)}
            />
            <span>
              Vender a crédito — límite {gs(Number(customer.creditLimitPyg))}
              {customer.creditDays ? ` · plazo estándar ${customer.creditDays} días` : ''}
            </span>
          </label>
          {venderACredito && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Label htmlFor="plazo-en-dias">Plazo en días</Label>
              <Input
                id="plazo-en-dias"
                aria-label="Días de crédito"
                inputMode="numeric"
                className="w-24"
                value={creditoDias}
                onChange={e => setCreditoDias(e.target.value.replace(/\D/g, ''))}
                placeholder={String(customer.creditDays ?? 30)}
              />
              <p className="text-xs text-mute">
                Vence{' '}
                {new Date(
                  Date.now() +
                    (Number(creditoDias) || Number(customer.creditDays) || 0) * 86400000,
                ).toLocaleDateString('es-PY')}
                . Podés igualmente registrar un adelanto abajo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Entrega primero (#230): el costo del envío se ve antes de cobrar. */}
            {/* Entrega + monto envío */}
      <div className={GRILLA_DOS_COLUMNAS}>
        <div>
          <Label htmlFor="entrega">Entrega</Label>
          <Select id="entrega" value={f.entrega} onChange={event => {
            const entrega = event.target.value
            // Retiro en tienda no cobra envío: al elegirlo se limpia el monto
            // para que el total y el cobro no arrastren un delivery viejo (#187).
            setF(actual => ({ ...actual, entrega, ...(entrega === 'Retiro en tienda' ? { montoDelivery: '' } : {}) }))
          }}>
            {ENTREGA.map(x => (
              <option key={x} value={x}>
                {x === 'Delivery'
                  ? 'Delivery'
                  : x === 'Encomienda'
                    ? 'Envío por encomienda'
                    : x === 'Retiro en tienda'
                      ? 'Retiro en tienda'
                      : x}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="monto-entrega">
            {f.entrega === 'Retiro en tienda' ? 'Monto del delivery (₲)' : f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Costo del envío (₲)'}
          </Label>
          <MoneyInput
            id="monto-entrega"
            max={LIMITE_MONTO_VENTAS}
            value={f.montoDelivery}
            onValueChange={v => setF(s => ({ ...s, montoDelivery: v }))}
            placeholder="0 si retira en tienda"
            disabled={f.entrega === 'Retiro en tienda'}
          />
        </div>
      </div>

      {/* Observación */}
      <div>
        <Label htmlFor="observacion">Observación</Label>
        <Textarea
          id="observacion"
          rows={1}
          value={f.observacion}
          onChange={event =>
            setF(current => ({ ...current, observacion: capitalizarPrimera(event.target.value) }))
          }
          placeholder="Notas, color, envío vía encomienda, etc."
          autoCapitalize="sentences"
        />
      </div>

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
      {/* #281 · identidad de color: pagos = violeta (reserved), distintas del
          carrito (verde) y del catálogo (marca). */}
      <div data-testid="pos-bloque-pagos" className="space-y-3 rounded-2xl border border-reserved/35 bg-reserved/[.04] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-reserved">
              Pagos de esta venta
            </p>
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
              <Aviso tono="warn" compact>
                El medio elegido sugiere un descuento del {descuentoMedioPct}% ({gs(descuentoMedioGs)}). Pedí autorización a gerencia para aplicarlo.
              </Aviso>
            )
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onAgregarPago()}
            disabled={!cuentas || guardando || guardadoIncompleto || sinProductos || sinTotal}
            title={sinProductos || sinTotal ? motivoPago : undefined}
          >
            + Agregar pago
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAgregarGiftCard?.()}
            disabled={!cuentas || guardando || guardadoIncompleto || !puedeCanjear}
            title={!puedeCanjear ? motivoGiftCard : undefined}
          >
            + Canjear gift card
          </Button>
          {pagos.length > 0 && pendiente > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onAgregarPago({ monto: pendiente })}
              disabled={!cuentas || guardando || guardadoIncompleto || sinProductos}
            >
              Dividir saldo ({gs(pendiente)})
            </Button>
          )}
        </div>
        {sinProductos && (
          <p role="status" data-testid="cobro-sin-productos" className="text-xs text-mute">
            Agregá productos a la venta para cargar pagos o canjear gift cards.
          </p>
        )}
        {cantTotal > 0 && totalGeneral <= 0 && (
          <p role="status" data-testid="cobro-total-cero" className="text-xs text-mute">
            Cargá un producto con precio para cobrar o canjear gift cards.
          </p>
        )}
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
            data-testid={`pago-fila-${i}`}
            data-estado={p.noPagado ? 'no-pagado' : 'pagado'}
            className={cn(
              'mobos-aparece grid grid-cols-1 items-end gap-2 border-l-2 pl-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]',
              p.noPagado ? 'border-l-warn/70' : 'border-l-ok/60',
              !usaCuentas && 'rounded-2xl border border-ink-600 bg-ink-800/30 p-3',
            )}
          >
            {/* Estado del bloque (#148 §11): un pago marcado «No pagado» no suma
                al cobrado y deja ese saldo pendiente en la venta. */}
            <div className="col-span-full flex flex-wrap items-center gap-2">
              {pagos.length > 1 && <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">Pago {i + 1}</span>}
              <button
                type="button"
                aria-pressed={!p.noPagado}
                title={p.noPagado ? 'Marcar como pagado' : 'Marcar como no pagado'}
                disabled={guardando}
                onClick={() => setPagos(a => a.map((x, j) => (j === i ? { ...x, noPagado: !x.noPagado } : x)))}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-50 md:min-h-0',
                  p.noPagado ? 'border-warn/40 bg-warn/10 text-warn' : 'border-ok/30 bg-ok/10 text-ok',
                )}
              >
                <Icon name={p.noPagado ? 'alert' : 'check'} className="h-3.5 w-3.5" />
                {p.noPagado ? 'No pagado' : 'Pagado'}
              </button>
              {p.noPagado && <span className="text-[11px] text-warn">No suma al cobrado: el saldo queda pendiente.</span>}
              {/* #265: el basurero vive dentro del bloque de pago (fila compacta),
                  con el mismo comportamiento y tooltip. */}
              <button
                type="button"
                className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad disabled:opacity-50 md:h-8 md:w-8"
                title="Eliminar pago"
                aria-label={`Eliminar pago ${i + 1}`}
                disabled={guardando}
                onClick={() => setPagos(a => a.filter((_, j) => j !== i))}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
            {p.giftCardCode !== undefined ? (
              <>
                <div className="sm:col-span-2">
                  <Label htmlFor={`gift-card-${i}`}>Código de gift card</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      id={`gift-card-${i}`}
                      aria-label={`Código de gift card del pago ${i + 1}`}
                      className="min-w-[12rem] flex-1 font-mono uppercase"
                      value={p.giftCardCode}
                      placeholder="GC-XXXX-XXXX-XXXX"
                      autoComplete="off"
                      onChange={event => setPagos(a => a.map((x, j) => (j === i ? { ...x, giftCardCode: event.target.value.toUpperCase(), giftCard: null, monto: '' } : x)))}
                    />
                    <Button type="button" variant="outline" disabled={guardando} onClick={() => onConsultarGiftCard?.(i)}>Consultar saldo</Button>
                  </div>
                  {p.giftCard && (
                    <p role="status" className={cn('mt-1 text-xs', p.giftCard.status === 'ACTIVE' && Number(p.giftCard.balancePyg) > 0 ? 'text-ok' : 'text-warn')}>
                      {p.giftCard.status === 'ACTIVE'
                        ? <>Saldo disponible: <b className="tabular-nums">{gs(Number(p.giftCard.balancePyg))}</b>{p.giftCard.customerName ? ` · ${p.giftCard.customerName}` : ''}</>
                        : p.giftCard.status === 'EXPIRED' ? 'La gift card está vencida.' : 'La gift card está anulada.'}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor={`gift-card-monto-${i}`}>Monto a canjear (Gs)</Label>
                  <MoneyInput
                    id={`gift-card-monto-${i}`}
                    aria-label={`Monto a canjear de la gift card del pago ${i + 1}`}
                    max={LIMITE_MONTO_VENTAS}
                    value={String(p.monto || '').replace(/\D/g, '')}
                    onValueChange={v => setPagos(a => a.map((x, j) => (j === i ? { ...x, monto: v === '' ? '' : String(v) } : x)))}
                    placeholder="0"
                  />
                </div>
              </>
            ) : usaCuentas ? (
              <PaymentAccountFields
                payment={p}
                accounts={cuentas}
                pendientePyg={pendiente}
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
                  <Input
                    id="cuenta"
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
                  <MoneyInput
                    id="monto-gs"
                    max={LIMITE_MONTO_VENTAS}
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
          </div>
        ))}
        {/* #281 · tiles con identidad propia: Total (info) · Pagado (ok) ·
            Pendiente (warn), con la familia de texto AA de cada tono. */}
        <div data-testid="pos-tiles-resumen" className="grid grid-cols-3 gap-2 border-t border-reserved/20 pt-3 text-xs text-mute">
          <span className="rounded-xl border border-info/35 bg-info/[.06] px-3 py-2 text-info" data-testid="cobro-total">
            <Icon name="receipt" className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />Total
            <strong className="v2-numero mt-0.5 block text-base tabular-nums text-fore">
              {gs(totalGeneral)}
            </strong>
          </span>
          <span className="rounded-xl border border-ok/35 bg-ok/[.08] px-3 py-2 text-ok" data-testid="cobro-pagado">
            <Icon name="check" className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />Pagado
            <strong className="v2-numero mt-0.5 block text-base tabular-nums text-ok">
              {gs(totalPagado)}
            </strong>
          </span>
          <span
            data-testid="cobro-pendiente"
            className={cn(
              'rounded-xl border px-3 py-2',
              pendiente ? 'border-warn/35 bg-warn/[.08] text-warn' : 'border-ok/25 bg-ok/[.04] text-ok',
            )}
          >
            <Icon name={pendiente ? 'alert' : 'check'} className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />Pendiente
            <strong
              className={cn(
                'v2-numero mt-0.5 block text-base tabular-nums',
                pendiente ? 'text-warn' : 'text-ok',
              )}
            >
              {gs(pendiente)}
            </strong>
          </span>
        </div>
      </div>

      {/* Guía inline (#148 §11): qué falta y cómo resolverlo, sin adivinar. */}
      {pendientes.length > 0 && (
        <Nota tono="warn" como="div" compact data-testid="guia-venta">
          <p className="font-semibold text-warn">
            {pendientes.some(p => p.motivo === 'imei')
              ? 'Seleccioná el IMEI/serial exacto de cada equipo antes de vender.'
              : 'Hay líneas sin stock: marcalas como «sobre pedido» para crear el pedido igual.'}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map(pendiente => (
              <li key={pendiente.key} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{pendiente.nombre}</span>
                {/* Con unidades disponibles la salida es elegir la unidad; sin
                    unidades (o sin stock) el pedido se marca sobre pedido. */}
                {pendiente.motivo === 'imei' && pendiente.unidades > 0 ? (
                  <Button type="button" variant="outline" className="min-h-11 px-2.5 text-xs md:h-8 md:min-h-0" disabled={guardando} onClick={() => onElegirUnidad?.(pendiente.key)}>
                    Elegir unidad{pendiente.unidades > 1 ? ` (${pendiente.unidades})` : ''}
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" className="min-h-11 px-2.5 text-xs md:h-8 md:min-h-0" disabled={guardando} onClick={() => onSobrePedido?.(pendiente.key)}>
                      {pendiente.motivo === 'imei' ? 'Vender sin IMEI' : 'Sobre pedido'}
                    </Button>
                    {/* #309: si el faltante es un lote que ya viene, la reserva
                        queda ligada a esa llegada. */}
                    <button
                      type="button"
                      className="min-h-11 font-semibold text-info hover:underline disabled:opacity-50 md:min-h-0"
                      disabled={guardando}
                      onClick={() => onTransito?.(pendiente.key)}
                    >
                      Llega en tránsito
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px]">
            «Crear pedido» la registra sin unidad y se completa al entregar.
          </p>
        </Nota>
      )}

      {!guardando && motivos.length > 0 && (
        <p role="status" data-testid="motivos-bloqueo" className="mb-2 text-xs font-semibold text-warn">
          Falta: {motivos.join(' · ')}
        </p>
      )}
      {/* Escritorio: la acción vive al pie del bloque de cobro. */}
      <div className="hidden items-center gap-3 lg:flex">
        <BotonGuardar className="sticky bottom-3 flex-1" />
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

      {/* Celular: Total y acción principal fijos abajo, arriba de la barra del
          shell (#309). El botón es el mismo submit del formulario. */}
      <div
        data-testid="pos-barra-accion"
        className="fixed inset-x-0 bottom-[calc(54px+env(safe-area-inset-bottom))] z-30 border-t border-ink-600 bg-ink-800/95 px-3 py-2 shadow-[0_-8px_24px_rgba(0,0,0,.18)] backdrop-blur lg:hidden"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-mute">Total</span>
            <b data-testid="barra-total" className="v2-numero block truncate text-lg font-extrabold tabular-nums text-fore">
              {gs(totalGeneral)}
            </b>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 px-3 text-xs"
            disabled={guardando}
            onClick={() => onIrAlCarrito?.()}
          >
            <Icon name="cart" className="h-4 w-4" />
            Carrito{cantTotal > 0 ? ` (${cantTotal})` : ''}
          </Button>
          <BotonGuardar className="shrink-0" />
        </div>
      </div>
    </section>
  )
}
