import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Aviso, BarraProgreso, Button, ConfirmDialog, Input, Label, MoneyInput, Nota, Select, Textarea } from '@/components/ui'
import CodigoSegmentado from '@/components/shared/CodigoSegmentado'
import { formatearCodigo, limpiarCodigo } from '@/lib/codigoSegmentado'
import Icon from '@/components/shared/Icon'
import SelectorMedioPago from '@/components/shared/SelectorMedioPago'
import NumericKeypad from '@/components/shared/NumericKeypad'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import { gs } from '@/utils/calculos'
import { detalleCredito, empresasRecientes, pagaAlRecibirVigente, puedeOfrecerCredito } from '@/utils/cobroPos'
import { capitalizarPrimera } from '@/utils/texto'
import { ENTREGA } from '@/lib/catalog'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { puedeCanjearGiftCard } from '@/lib/validacionGlobal'
import PaymentAccountFields from '../PaymentAccountFields'
import { cuentaEfectivoPyg, FOREIGN, residuoSubCentavo, updateAccountPayment } from '@/utils/pagoCuenta'
import CreditoAutorizacion from './CreditoAutorizacion'
import { useMediaQuery } from '@/components/shared/useMediaQuery'

// Cómo se paga y cómo se entrega, en la misma pantalla que el resto de la
// venta. Cierra con el botón que guarda, pegado al pie para no perderse al
// completar los pagos.
// El estado guarda «GC-XXXX-XXXX-XXXX» (lo que consulta la API); las celdas muestran el cuerpo.
const cuerpoGiftCard = (codigo) => limpiarCodigo(codigo, 'crockford', 'GC')

export default function PasoCobro({
  customer,
  repartidores = [],
  pagaAlRecibir: pagaAlRecibirActivo = false,
  setPagaAlRecibir,
  venderACredito,
  setVenderACredito,
  creditoDias,
  setCreditoDias,
  evaluacionCredito = null,
  creditoPin = '',
  setCreditoPin = () => {},
  creditoAutorizoYo = false,
  setCreditoAutorizoYo = () => {},
  puedeAutorizarCredito = false,
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
  vuelto = 0,
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
  modoMovil = false,
}) {
  // The desktop payment footer must not exist in the DOM on touch/tablet
  // layouts. CSS-only hiding left the sticky subtree hit-testable in the
  // mobile sheet in Chromium, so select the render path before mounting it.
  const ocultarPieEnTouch = useMediaQuery('(max-width: 1023px)')
  // El botón principal dice qué se está por crear según lo cobrado: verde si
  // está pago, naranja si es parcial y rojo si queda pendiente/a crédito.
  // «Paga al recibir» (#390): no se pide el medio todavía; el pedido queda
  // pendiente y se cobra después desde la lista de pedidos.
  const pagaAlRecibir = pagaAlRecibirVigente(pagaAlRecibirActivo, pagos)
  const direccionesGuardadas = (customer?.addresses || []).filter(d => d?.id)
  const [confirmarPaga, setConfirmarPaga] = useState(false)
  const [notaAbierta, setNotaAbierta] = useState(() => Boolean(f.observacion))
  // Si entra una observación desde afuera (borrador, reserva) el campo se abre.
  useEffect(() => { if (f.observacion) setNotaAbierta(true) }, [f.observacion])
  const pagoCompleto = totalGeneral > 0 && totalPagado >= totalGeneral
  // Pagos paso a paso: la fila vigente (la última) debe tener monto para sumar otra.
  const ultimoPago = pagos[pagos.length - 1]
  const cuentaUltimo = usaCuentas && ultimoPago && ultimoPago.giftCardCode === undefined ? (cuentas || []).find(c => c.id === ultimoPago.accountId) : null
  const sinCuentaOCotizacion = Boolean(usaCuentas && ultimoPago && ultimoPago.giftCardCode === undefined) && (!cuentaUltimo || (FOREIGN(cuentaUltimo.currency) && !(Number(ultimoPago.exchangeRatePyg) > 0)))
  const pagoIncompleto = Boolean(ultimoPago) && (sinCuentaOCotizacion || !(Number(String(ultimoPago.monto || '').replace(/\D/g, '')) > 0))
  // Saldo menor a un centavo de dólar: no se cobra en USD; se cierra en Gs con un clic.
  const residuoGs = usaCuentas ? residuoSubCentavo(pendiente, ultimoPago, cuentas) : 0
  const efectivoGs = cuentaEfectivoPyg(cuentas)
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
  // Un solo aviso por problema: «sin productos» ya lo dice el bloque de pagos y
  // las líneas pendientes las guía su propia nota.
  const motivosVisibles = motivos.filter(m => !(sinProductos && !pagaAlRecibir && /producto/i.test(m)))
  const etiquetaBoton = guardando
    ? 'Guardando venta…'
    : !valido
      ? 'Guardar pedido'
      : pagoCompleto
        ? 'Confirmar venta'
        : sinPago
          ? (venderACredito ? (evaluacionCredito?.requiereAutorizacion && !creditoAutorizoYo && !creditoPin ? 'Crear pedido · pendiente de autorización' : 'Crear pedido a crédito') : pagaAlRecibir ? 'Crear pedido · paga al recibir' : 'Crear pedido sin pago')
          : 'Crear pedido'
  // Primary action remains neutral in every payment state (#341); status
  // meaning is preserved in the label and the payment summary.
  const clasesBoton = 'h-auto min-h-14 min-w-0 px-5 py-3 lg:min-h-12 lg:py-1.5'
  // Un solo botón para los dos lugares (escritorio y barra fija del celular).
  function BotonGuardar({ className }) {
    return (
      <Button
        type="submit"
        variant="primary"
        className={cn(clasesBoton, className)}
        disabled={!valido || guardando || !cuentas || Boolean(errorCuentas) || guardadoIncompleto}
        title={motivos[0] || undefined}
      >
        <span className="flex min-w-0 flex-col items-center gap-0.5 leading-tight lg:flex-row lg:gap-2">
          <span className="text-[15px] font-bold">{etiquetaBoton}</span>
          {detalleBoton && <span className="flex flex-col items-center text-xs font-semibold tabular-nums opacity-95 lg:flex-row lg:gap-2 lg:text-[15px]">
            {cantTotal > 1 && <span className="lg:hidden">{cantTotal} productos</span>}
            {totalGeneral > 0 && <span className="pos-money-value">{gs(totalGeneral)}</span>}
          </span>}
        </span>
      </Button>
    )
  }
  return (
    <section
      data-testid="pos-cobro"
      className={cn(
        'pos-cobro flex min-h-0 flex-col gap-2 rounded-2xl border border-ink-600 bg-ink-800 p-2.5 shadow-card',
        // Lenguaje v2 (#241, paso 5): el bloque de cobro detrás del flag.
        temaV2Activo() && 'tema-v2',
      )}
    >
      <header data-testid="pos-cobro-header" className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-600/70 px-1 pb-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fono-light">Paso 2 · Cobrar</p>
          <h3 className="truncate text-base font-bold text-ink-100">Entrega, pagos y confirmación</h3>
        </div>
        {onIrAlCarrito && (
          <Button type="button" variant="secondary" className="min-h-10 shrink-0" onClick={onIrAlCarrito}>
            <Icon name="cart" className="mr-1.5 h-4 w-4" />
            Editar ticket
          </Button>
        )}
      </header>
      {/* «Falta cobrar»: el número grande del cobro baja con cada pago hasta
          cero. Solo presentación: usa los mismos importes del pie. */}
      {!modoMovil && totalGeneral > 0 && (
        <div
          data-testid="pos-falta-hero"
          data-completo={pendiente <= 0 ? 'si' : undefined}
          role="group"
          aria-label="Falta cobrar"
          className="pos-falta-hero"
        >
          <span className="pos-falta-etiqueta">{pendiente <= 0 ? 'Cobro completo' : 'Falta cobrar'}</span>
          <strong className="pos-falta-numero pos-money-value v2-numero tabular-nums">{gs(Math.max(0, pendiente))}</strong>
          <span className="pos-falta-detalle">de {gs(totalGeneral)} · pagado {gs(totalPagado)}</span>
          <BarraProgreso valor={Math.min(100, Math.max(0, Math.round((totalPagado / totalGeneral) * 100)))} tono="fono" etiqueta="Progreso del cobro" className="pos-falta-barra mt-2.5 w-full bg-ink-600" />
        </div>
      )}
      {/* Entrega, crédito, nota y «paga al recibir» en un bloque compacto: la
          entrega y «Vender a crédito» comparten renglón; la nota es un casillero
          que despliega su campo debajo. */}
      <div data-testid="pos-entrega" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="entrega" className="mb-0 shrink-0">Entrega</Label>
          <Select id="entrega" className="h-9 w-48" value={f.entrega} onChange={event => {
            const entrega = event.target.value
            // Sin envío a cobrar se limpia el monto para que el total y el
            // cobro no arrastren un delivery viejo (#187).
            setF(actual => ({ ...actual, entrega, ...(entrega === 'Delivery' || entrega === 'Encomienda' ? {} : { montoDelivery: '' }) }))
          }}>
            {ENTREGA.map(x => (
              <option key={x} value={x}>
                {x === 'Encomienda' ? 'Envío por encomienda' : x}
              </option>
            ))}
          </Select>
        </div>
        {(f.entrega === 'Delivery' || f.entrega === 'Encomienda') && (
          <div className="flex items-center gap-2">
            <Label htmlFor="monto-entrega" className="mb-0 shrink-0">
              {f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Costo del envío (₲)'}
            </Label>
            <MoneyInput
              id="monto-entrega"
              max={LIMITE_MONTO_VENTAS}
              value={f.montoDelivery}
              onValueChange={v => setF(s => ({ ...s, montoDelivery: v }))}
              placeholder="0"
              className="h-9 w-32"
            />
          </div>
        )}
        {/* Venta a crédito / fiado: interruptor compacto con cualquier cliente de la ficha;
            el límite y la autorización del dueño los resuelve el servidor. */}
        {puedeOfrecerCredito(customer) && (
          <div data-testid="pos-credito" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-fono/25 bg-fono/5 px-2.5 py-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8">
              <input
                type="checkbox"
                role="switch"
                className="h-4 w-4 shrink-0 accent-fono"
                checked={venderACredito && !customer.blocked}
                disabled={Boolean(customer.blocked)}
                onChange={e => setVenderACredito(e.target.checked)}
              />
              <span className="font-semibold">Vender a crédito / fiado</span>
              <span className="text-xs text-mute">{detalleCredito(customer, n => gs(n))}</span>
              {customer.blocked ? <span className="text-xs font-semibold text-bad-text">No disponible: cliente bloqueado</span> : null}
            </label>
            {venderACredito && (
              <span className="flex flex-wrap items-center gap-2">
                <Label htmlFor="plazo-en-dias" className="mb-0">Plazo en días</Label>
                <Input
                  id="plazo-en-dias"
                  aria-label="Días de crédito"
                  inputMode="numeric"
                  className="h-8 w-20"
                  value={creditoDias}
                  onChange={e => setCreditoDias(e.target.value.replace(/\D/g, ''))}
                  placeholder={String(customer.creditDays ?? 30)}
                />
                <span className="text-xs text-mute">
                  Vence{' '}
                  {new Date(
                    Date.now() +
                      (Number(creditoDias) || Number(customer.creditDays) || 0) * 86400000,
                  ).toLocaleDateString('es-PY')}
                </span>
              </span>
            )}
            {venderACredito && (
              <CreditoAutorizacion
                evaluacion={evaluacionCredito}
                pin={creditoPin}
                setPin={setCreditoPin}
                autorizoYo={creditoAutorizoYo}
                setAutorizoYo={setCreditoAutorizoYo}
                puedeAutorizar={puedeAutorizarCredito}
                deshabilitado={guardando}
              />
            )}
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold md:min-h-8" data-testid="pos-nota-casillero">
          <input
            type="checkbox"
            className="h-4 w-4 accent-fono"
            checked={notaAbierta}
            onChange={e => {
              setNotaAbierta(e.target.checked)
              if (!e.target.checked) setF(current => ({ ...current, observacion: '' }))
            }}
          />
          Agregar nota
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold md:min-h-8" data-testid="pos-paga-al-recibir">
          <input
            type="checkbox"
            role="switch"
            className="h-4 w-4 accent-fono"
            checked={pagaAlRecibir}
            disabled={guardando}
            onChange={e => {
              // Con pagos cargados (gift card consultada, canje) no se descartan en silencio.
              if (e.target.checked && pagos.length > 0) { setConfirmarPaga(true); return }
              setPagaAlRecibir(e.target.checked)
            }}
          />
          Paga al recibir
        </label>
        {pagaAlRecibir && (
          <p role="status" data-testid="cobro-paga-al-recibir" className="min-w-0 flex-1 text-xs text-mute">
            No se elige el medio de pago ahora: el pedido queda pendiente y se cobra desde Pedidos.
          </p>
        )}
      </div>

      {/* Delivery (#461): a dónde se entrega y quién lo lleva (o se asigna después). */}
      {f.entrega === 'Delivery' && (
        <div data-testid="pos-delivery" className="flex flex-wrap items-end gap-3">
          <div className="w-full md:w-72">
            <Label htmlFor="entrega-direccion">Dirección de entrega</Label>
            {direccionesGuardadas.length > 0 && (
              <Select
                id="entrega-direccion-guardada"
                aria-label="Dirección guardada del cliente"
                className="mb-1"
                value={f.entregaDireccionId || ''}
                onChange={e => setF(s => ({ ...s, entregaDireccionId: e.target.value, entregaDireccion: e.target.value ? '' : s.entregaDireccion }))}
              >
                <option value="">Otra dirección…</option>
                {direccionesGuardadas.map(d => (
                  <option key={d.id} value={d.id}>{[d.label, d.address, d.city].filter(Boolean).join(' · ')}</option>
                ))}
              </Select>
            )}
            {!f.entregaDireccionId && (
              <Input
                id="entrega-direccion"
                maxLength={300}
                autoComplete="street-address"
                value={f.entregaDireccion || ''}
                onChange={e => setF(s => ({ ...s, entregaDireccion: e.target.value }))}
                placeholder="Calle, número, barrio y referencia"
              />
            )}
          </div>
          <div className="w-full md:w-56">
            <Label htmlFor="entrega-repartidor">Repartidor</Label>
            <Select id="entrega-repartidor" value={f.repartidorId || ''} onChange={e => setF(s => ({ ...s, repartidorId: e.target.value }))}>
              <option value="">Asignar después</option>
              {repartidores.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        </div>
      )}

      {/* Encomienda (#399): empresa, sucursal de destino y dirección del cliente. */}
      {f.entrega === 'Encomienda' && (
        <div data-testid="pos-encomienda" className="flex flex-wrap items-end gap-3">
          <div className="w-full md:w-56">
            <Label htmlFor="enc-empresa">Empresa</Label>
            <Input
              id="enc-empresa"
              list="enc-empresas"
              maxLength={120}
              autoComplete="off"
              value={f.encEmpresa || ''}
              onChange={e => setF(s => ({ ...s, encEmpresa: e.target.value }))}
              placeholder="Ej. Nuestra Señora"
            />
            <datalist id="enc-empresas">
              {empresasRecientes().map(nombre => <option key={nombre} value={nombre} />)}
            </datalist>
          </div>
          <div className="w-full md:w-56">
            <Label htmlFor="enc-sucursal">Sucursal destino</Label>
            <Input
              id="enc-sucursal"
              maxLength={200}
              autoComplete="off"
              value={f.encSucursal || ''}
              onChange={e => setF(s => ({ ...s, encSucursal: e.target.value }))}
              placeholder="Ej. Ciudad del Este"
            />
          </div>
          {direccionesGuardadas.length > 0 && (
            <div className="w-full md:w-72">
              <Label htmlFor="enc-direccion">Dirección</Label>
              <Select id="enc-direccion" value={f.encDireccionId || ''} onChange={e => setF(s => ({ ...s, encDireccionId: e.target.value }))}>
                <option value="">Sin dirección</option>
                {direccionesGuardadas.map(d => (
                  <option key={d.id} value={d.id}>{[d.label, d.address, d.city].filter(Boolean).join(' · ')}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {notaAbierta && (
        <div>
          <Label htmlFor="observacion" className="sr-only">Observación</Label>
          <Textarea
            id="observacion"
            rows={2}
            autoFocus={!f.observacion}
            value={f.observacion}
            onChange={event =>
              setF(current => ({ ...current, observacion: capitalizarPrimera(event.target.value) }))
            }
            placeholder="Notas, color, envío vía encomienda, etc."
            autoCapitalize="sentences"
          />
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
      {/* #281 · identidad de color: pagos = violeta (reserved), distintas del
          carrito (verde) y del catálogo (marca). */}
      <div data-testid="pos-bloque-pagos" className="pos-bloque-pagos space-y-3 [&>*]:!mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-visible rounded-2xl border border-reserved/35 bg-reserved/[.04] p-2.5">
        <div className={cn('flex flex-wrap items-center gap-2', pagaAlRecibir && 'hidden')}>
          <p className="min-w-[12rem] flex-1 text-[11px] font-medium uppercase tracking-wider text-reserved">
            Pagos de esta venta
          </p>
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
          {/* Pasos: el siguiente pago se habilita cuando el actual tiene cuenta
              y monto; la fila nueva propone lo que falta cobrar. */}
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 whitespace-nowrap md:h-9"
            onClick={() => onAgregarPago()}
            disabled={!cuentas || guardando || guardadoIncompleto || sinProductos || sinTotal || pagoIncompleto}
            title={sinProductos || sinTotal ? motivoPago : pagoIncompleto ? 'Completá la cuenta y el monto del pago actual para agregar otro.' : undefined}
          >
            {pagos.length === 0 ? '+ Agregar pago' : '+ Agregar otro pago'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 whitespace-nowrap md:h-9"
            onClick={() => onAgregarGiftCard?.()}
            disabled={!cuentas || guardando || guardadoIncompleto || !puedeCanjear || pagoIncompleto}
            title={!puedeCanjear ? motivoGiftCard : undefined}
          >
            + Canjear gift card
          </Button>
        </div>
        {sinProductos && !pagaAlRecibir && (
          <p role="status" data-testid="cobro-sin-productos" className="text-xs text-mute">
            Agregá productos a la venta para cargar pagos o canjear gift cards.
          </p>
        )}
        {cantTotal > 0 && totalGeneral <= 0 && !pagaAlRecibir && (
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
        {!pagaAlRecibir && pagos.length > 0 && <div data-testid="pos-pagos-lista" className="pos-pagos-lista flex min-h-0 flex-none flex-col gap-2 overflow-visible pr-0.5">{pagos.map((p, i) => {
          const enTarjeta = usaCuentas && p.giftCardCode === undefined
          const controles = (
            <>
              <button
                type="button"
                aria-pressed={!p.noPagado}
                title={p.noPagado ? 'Marcar como pagado' : 'Marcar como no pagado'}
                disabled={guardando}
                onClick={() => setPagos(a => a.map((x, j) => (j === i ? { ...x, noPagado: !x.noPagado } : x)))}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-50',
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
                className="grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad disabled:opacity-50"
                title="Eliminar pago"
                aria-label={`Eliminar pago ${i + 1}`}
                disabled={guardando}
                onClick={() => setPagos(a => a.filter((_, j) => j !== i))}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </>
          )
          return (
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
            {!enTarjeta && <div className="col-span-full flex flex-wrap items-center gap-2">{controles}</div>}
            {p.giftCardCode !== undefined ? (
              <>
                <div className="sm:col-span-2">
                  <Label htmlFor={`gift-card-${i}`}>Código de gift card</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <CodigoSegmentado
                      id={`gift-card-${i}`}
                      ariaLabel={`Código de gift card del pago ${i + 1}`}
                      grupos={[4, 4, 4]}
                      alfabeto="crockford"
                      prefijo="GC"
                      className="min-w-[12rem] flex-1"
                      mensajeIncompleto="Pegá el código completo o escribilo; avanza solo."
                      value={cuerpoGiftCard(p.giftCardCode)}
                      onChange={(cuerpo) => setPagos(a => a.map((x, j) => (j === i ? { ...x, giftCardCode: cuerpo ? formatearCodigo(cuerpo, [4, 4, 4], '-', 'GC') : '', giftCard: null, monto: '' } : x)))}
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
                acciones={controles}
                onDividir={() => onAgregarPago({ monto: pendiente })}
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
          )
        })}</div>}
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

      {!guardando && motivosVisibles.length > 0 && (
        <p role="status" data-testid="motivos-bloqueo" className="mb-2 text-xs font-semibold text-warn">
          Falta: {motivosVisibles.join(' · ')}
        </p>
      )}
      {/* Pie del cobro: Pagado / Pendiente y la acción, siempre a la vista
          (pegado abajo). #281 · tiles con identidad propia: Pagado (ok) ·
          Pendiente (warn). El Total vive una sola vez, en el pie del carrito. */}
      {!modoMovil && !ocultarPieEnTouch && (
      <div data-testid="pos-pie-cobro" className="-mx-2.5 -mb-2.5 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-ink-600 bg-ink-800 px-2.5 pb-2.5 pt-2">
        <div data-testid="pos-tiles-resumen" className="pos-tiles flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-mute">
          <span className="flex items-baseline gap-2 rounded-lg border border-ok/35 bg-ok/[.08] px-2.5 py-1 text-ok" data-testid="cobro-pagado">
            <span className="inline-flex items-center gap-1"><Icon name="check" className="inline h-3 w-3" aria-hidden="true" />Pagado</span>
            <strong className="pos-money-value v2-numero whitespace-nowrap text-sm tabular-nums text-ok">
              {gs(totalPagado)}
            </strong>
          </span>
          {vuelto > 0 && (
            <span data-testid="cobro-vuelto" className="flex items-baseline gap-2 rounded-lg border border-fono/35 bg-fono/[.08] px-2.5 py-1 text-fono-light">
              <span>Vuelto</span>
              <strong className="pos-money-value v2-numero whitespace-nowrap text-sm tabular-nums">{gs(vuelto)}</strong>
            </span>
          )}
          <span
            data-testid="cobro-pendiente"
            className={cn(
              'flex items-baseline gap-2 rounded-lg border px-2.5 py-1',
              pendiente ? 'border-warn/35 bg-warn/[.08] text-warn' : 'border-ok/25 bg-ok/[.04] text-ok',
            )}
          >
            <span className="inline-flex items-center gap-1"><Icon name={pendiente ? 'alert' : 'check'} className="inline h-3 w-3" aria-hidden="true" />Pendiente</span>
            <strong
              className={cn(
                'pos-money-value v2-numero whitespace-nowrap text-sm tabular-nums',
                pendiente ? 'text-warn' : 'text-ok',
              )}
            >
              {gs(pendiente)}
            </strong>
          </span>
          {residuoGs > 0 && efectivoGs && (
            <button
              type="button"
              data-testid="cobro-completar-gs"
              className="toque-44 inline-flex min-h-11 items-center rounded-lg border border-fono/40 px-2.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10 md:min-h-8"
              onClick={() => onAgregarPago({ monto: residuoGs, cuenta: efectivoGs })}
              title="El saldo es menor a un centavo de dólar: se cobra en guaraníes en efectivo"
            >
              Completar en Gs ({gs(residuoGs)})
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1 items-center gap-3 basis-48 hidden lg:flex">
          <BotonGuardar className="flex-1" />
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
      )}
      {modoMovil && (
        <div className="flex w-full flex-wrap items-center gap-3 pt-2">
          <div data-testid="pos-tiles-resumen" className="pointer-events-none flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-mute">
            <span className="flex items-baseline gap-2 rounded-lg border border-ok/35 bg-ok/[.08] px-2.5 py-1 text-ok" data-testid="cobro-pagado">
              <span>Pagado</span><strong className="pos-money-value v2-numero whitespace-nowrap text-sm tabular-nums text-ok">{gs(totalPagado)}</strong>
            </span>
            <span data-testid="cobro-pendiente" className={cn('flex items-baseline gap-2 rounded-lg border px-2.5 py-1', pendiente ? 'border-warn/35 bg-warn/[.08] text-warn' : 'border-ok/25 bg-ok/[.04] text-ok')}>
              <span>Pendiente</span><strong className={cn('pos-money-value v2-numero whitespace-nowrap text-sm tabular-nums', pendiente ? 'text-warn' : 'text-ok')}>{gs(pendiente)}</strong>
            </span>
          </div>
          <BotonGuardar className="w-full flex-1" />
        </div>
      )}
      {/* Celular: Total y acción principal fijos abajo, arriba de la barra del
          shell (#309). El botón es el mismo submit del formulario. */}
      {/* En el celular nuevo (#429) el carrito y el cobro viven en hojas: sin barra fija. */}
      <div
        data-testid="pos-barra-accion"
        hidden={modoMovil}
        className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-ink-600 bg-ink-800/95 px-3 py-2 shadow-[0_-8px_24px_rgba(0,0,0,.18)] backdrop-blur lg:hidden"
      >
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <div className="col-span-2 min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-mute">Total</span>
            <b data-testid="barra-total" className="pos-money-value v2-numero block text-lg font-extrabold tabular-nums text-fore">
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
          <BotonGuardar className="w-full px-2" />
        </div>
      </div>
      {createPortal(<ConfirmDialog
        open={confirmarPaga}
        onCancel={() => setConfirmarPaga(false)}
        onConfirm={() => {
          setConfirmarPaga(false)
          setPagos([])
          setPagaAlRecibir(true)
        }}
        title="¿Descartar los pagos cargados?"
        description={`Hay ${pagos.length} ${pagos.length === 1 ? 'pago cargado' : 'pagos cargados'} (${gs(totalPagado)}). Con «Paga al recibir» se descartan, incluidos gift cards consultadas y canjes, y el pedido queda pendiente.`}
        confirmLabel="Descartar pagos"
        variant="danger"
      />, document.body)}
    </section>
  )
}
