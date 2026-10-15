import CreditoAutorizacion from '../venta/CreditoAutorizacion'
import { useEffect, useRef, useState } from 'react'
import { Aviso, Button } from '@/components/ui'
import BottomSheet from '@/components/shared/BottomSheet'
import NumericKeypad from '@/components/shared/NumericKeypad'
import Icon from '@/components/shared/Icon'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { gs } from '@/utils/calculos'
import { detalleCredito, puedeOfrecerCredito } from '@/utils/cobroPos'
import { cn } from '@/lib/utils'
import {
  cuentasRapidas,
  esEfectivo,
  mediosLegacy,
  montoDeFila,
  montoDeTeclado,
  pagoDeMedio,
  pagoReal,
  tituloPago,
  vueltoDePagos,
} from './posMovil'

// Tras cambiar de paso, un segundo toque en el mismo lugar cae sobre otro botón
// (p. ej. «monto exacto» bajo «Efectivo»). Se ignora ese toque doble.
const MS_ANTIREBOTE = 350

// Cobro paso a paso del celular (#429), modelo Shopify POS: total grande,
// medios a ancho completo, teclado de monto propio (Cancelar / Aceptar), pago
// dividido («Segundo pago», «Tercer pago», «Cancelar división»), efectivo con
// monto recibido y banner de vuelto, y confirmación «Marcar como pagado» para
// transferencias y tarjetas. NO tiene lógica de venta propia: carga las mismas
// filas de `pagos` que el cobro de escritorio y el guardado es el submit del
// mismo formulario (`form="pos-venta-form"`), así que offline, idempotencia,
// IMEI, crédito, envío y «Paga al recibir» siguen siendo los de FormularioVenta.
const ICONO_MEDIO = { CASH: 'money', TRANSFER: 'bank', CARD: 'card', PIX: 'qr', CRYPTO: 'wallet' }

// El importe grande se achica según el largo para que Gs 99.000.000.000 entre
// completo, en una línea, hasta en 320 px.
const tamanoImporte = texto => (texto.length <= 12 ? 'text-[2.5rem]' : texto.length <= 15 ? 'text-[2rem]' : 'text-[1.5rem]')

function Importe({ etiqueta, valor, chico = false, testId }) {
  return (
    <div className="text-center">
      {etiqueta && <p className="mb-1 text-sm font-semibold leading-tight text-mute">{etiqueta}</p>}
      <p
        data-testid={testId}
        className={cn('v2-numero whitespace-nowrap font-extrabold leading-tight tabular-nums tracking-tight text-fore', chico ? 'text-3xl' : tamanoImporte(valor))}
      >
        {valor}
      </p>
    </div>
  )
}

function BotonMedio({ icono, titulo, detalle, onClick, disabled, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800 px-4 text-left transition active:scale-[.99] enabled:hover:border-fono disabled:opacity-40"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
        <Icon name={icono} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{titulo}</span>
        {detalle && <span className="block truncate text-xs text-mute">{detalle}</span>}
      </span>
      <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-mute" />
    </button>
  )
}

export default function CobroMovil({
  open,
  onClose,
  cuentas,
  usaCuentas,
  errorCuentas,
  onReintentarCuentas,
  pagos,
  setPagos,
  totalGeneral,
  totalPagado,
  pendiente,
  cantTotal,
  customer,
  pagaAlRecibir,
  setPagaAlRecibir,
  venderACredito,
  setVenderACredito,
  evaluacionCredito = null,
  creditoPin = '',
  setCreditoPin = () => {},
  creditoAutorizoYo = false,
  setCreditoAutorizoYo = () => {},
  puedeAutorizarCredito = false,
  guardando,
  guardadoIncompleto,
  valido,
  motivos,
  errorVenta,
  etiquetaConfirmar,
  completo,
  masContenido = null,
}) {
  const sinTotal = totalGeneral <= 0 || cantTotal === 0
  // Con el cobro ya completo (pagos cargados) se abre en la confirmación.
  const inicial = () => (pagos.some(pagoReal) && pendiente === 0) || pagaAlRecibir || venderACredito ? 'confirmar' : 'medios'
  const [paso, setPaso] = useState(inicial)
  const [medio, setMedio] = useState(null)
  // Monto de ESTE pago (null = todo el saldo). Se cambia con el teclado.
  const [montoPago, setMontoPago] = useState(null)
  const [digitos, setDigitos] = useState('')
  const [teclado, setTeclado] = useState('pago') // 'pago' | 'recibido'
  const [parcialAbierto, setParcialAbierto] = useState(false)
  const cambioDePaso = useRef(0)

  // Filas vacías (p. ej. USD/BRL sin cotización ni importe) no son pagos.
  const reales = pagos.filter(pagoReal)
  const vuelto = vueltoDePagos(pagos)
  const saldo = pendiente
  const aPagar = Math.min(montoPago ?? saldo, saldo)
  const rapidas = usaCuentas ? cuentasRapidas(cuentas) : mediosLegacy()
  const etiquetaSaldo = reales.length === 0 ? 'Total' : 'Saldo'

  function irA(siguiente) {
    cambioDePaso.current = Date.now()
    setPaso(siguiente)
  }
  const tocoRapido = () => Date.now() - cambioDePaso.current < MS_ANTIREBOTE
  // Acción de un botón que aparece bajo el dedo al cambiar de paso: ignora el rebote.
  const sinRebote = accion => () => { if (!tocoRapido()) accion() }

  // Si cambia el estado desde afuera (pagos borrados), la pantalla se acomoda.
  useEffect(() => {
    if (!open) return
    if (paso === 'confirmar' && reales.length === 0 && !pagaAlRecibir && !venderACredito) irA('medios')
  }, [open, paso, reales.length, pagaAlRecibir, venderACredito])

  if (!open) return null

  // Cancelar un paso no borra el monto parcial ya elegido para este pago.
  const volverAMedios = () => {
    setMedio(null)
    setDigitos('')
    irA('medios')
  }

  function abrirTeclado(para, inicio) {
    setTeclado(para)
    setDigitos(inicio > 0 ? String(inicio) : '')
    irA('teclado')
  }

  function elegirMedio(elegido) {
    setMedio(elegido)
    if (esEfectivo(elegido)) irA('recibido')
    else irA('cuenta')
  }

  // Agrega la fila al cobro y decide el siguiente paso: más pagos o confirmar.
  function agregarPago(elegido, monto, recibidoEfectivo = 0) {
    if (tocoRapido()) return
    setPagos(lista => [...lista.filter(pagoReal), pagoDeMedio(elegido, monto, recibidoEfectivo)])
    setMedio(null)
    setMontoPago(null)
    setDigitos('')
    irA(saldo - monto > 0 ? 'medios' : 'confirmar')
  }

  function cancelarDivision() {
    setPagos([])
    setMontoPago(null)
    volverAMedios()
  }

  // Al salir de «Otros medios» se descartan las filas vacías que quedaron abiertas.
  function salirDeMas() {
    setPagos(lista => (lista.every(pagoReal) ? lista : lista.filter(pagoReal)))
    volverAMedios()
  }

  let titulo = 'Cobro'
  if (paso === 'medios') titulo = reales.length === 0 ? 'Cobro' : tituloPago(reales.length)
  if (paso === 'teclado') titulo = teclado === 'recibido' ? 'Monto recibido' : 'Monto del pago'
  if (paso === 'recibido') titulo = 'Efectivo'
  if (paso === 'cuenta') titulo = `Aceptar pago con ${medio?.name || ''}`
  if (paso === 'confirmar') titulo = 'Confirmar venta'
  if (paso === 'mas') titulo = 'Otros medios y entrega'

  const accion =
    reales.length > 0 && (paso === 'medios' || paso === 'confirmar') ? (
      <button
        type="button"
        data-testid="cobro-cancelar-division"
        onClick={cancelarDivision}
        disabled={guardando}
        className="min-h-11 rounded-lg px-2 text-sm font-semibold text-bad-text disabled:opacity-40"
      >
        Cancelar división
      </button>
    ) : paso === 'mas' ? (
      <button type="button" onClick={salirDeMas} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-fono-light">
        Volver
      </button>
    ) : null

  return (
    <>
    <BottomSheet
      open={open}
      onClose={onClose}
      title={titulo}
      size="full"
      busy={guardando}
      accion={accion}
      testId="cobro-movil"
    >
      <div className="space-y-4 pb-4">
        {errorVenta && (
          <Aviso tono="error" className="rounded-xl text-sm">
            {errorVenta}
          </Aviso>
        )}

        {paso === 'medios' && (
          <>
            <div className="space-y-2 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-5">
              <Importe etiqueta={montoPago != null && montoPago < saldo ? 'Este pago' : etiquetaSaldo} valor={gs(aPagar)} testId="cobro-total-grande" />
              {montoPago != null && montoPago < saldo && (
                <p className="text-center text-sm text-mute">Saldo: <b className="tabular-nums text-fore">{gs(saldo)}</b></p>
              )}
              {reales.length > 0 && (
                <p className="text-center text-xs text-mute">
                  Total <b data-testid="cobro-total-venta" className="whitespace-nowrap tabular-nums text-fore">{gs(totalGeneral)}</b>
                  {' · '}Pagado <b data-testid="cobro-pagado-venta" className="whitespace-nowrap tabular-nums text-ok">{gs(totalPagado)}</b>
                </p>
              )}
              <button
                type="button"
                data-testid="cobro-dividir"
                disabled={sinTotal || saldo <= 0}
                onClick={() => abrirTeclado('pago', 0)}
                className="mx-auto flex min-h-11 items-center gap-1.5 rounded-full border border-fono/40 px-4 text-sm font-semibold text-fono-light disabled:opacity-40"
              >
                {reales.length === 0 ? 'Pagar otro monto' : 'Cambiar monto'}
                <Icon name="chevron" className="h-3.5 w-3.5" />
              </button>
            </div>

            {sinTotal && (
              <p role="status" className="text-center text-sm text-mute">
                Agregá productos con precio para cobrar.
              </p>
            )}
            {!cuentas && !errorCuentas && <p role="status" className="text-sm text-mute">Cargando medios de cobro…</p>}
            {errorCuentas && (
              <div role="alert" className="text-sm text-bad">
                {errorCuentas}{' '}
                <Button type="button" variant="ghost" onClick={onReintentarCuentas}>Reintentar carga</Button>
              </div>
            )}

            {cuentas && (
              <div className="space-y-2" data-testid="cobro-medios">
                {rapidas.map(m => (
                  <BotonMedio
                    key={m.id}
                    testId={`medio-${m.id}`}
                    icono={ICONO_MEDIO[m.kind] || 'card'}
                    titulo={m.name}
                    detalle={KIND_LABELS[m.kind] && KIND_LABELS[m.kind] !== m.name ? KIND_LABELS[m.kind] : ''}
                    disabled={sinTotal || saldo <= 0 || guardando || guardadoIncompleto}
                    onClick={() => elegirMedio(m)}
                  />
                ))}
                {reales.length === 0 && puedeOfrecerCredito(customer) && (
                  <BotonMedio
                    testId="medio-credito"
                    icono="clock"
                    titulo="Vender a crédito / fiado"
                    detalle={detalleCredito(customer, n => gs(n))}
                    disabled={sinTotal || guardando}
                    onClick={() => { setPagos(l => l.filter(pagoReal)); setVenderACredito(true); irA('confirmar') }}
                  />
                )}
                {reales.length === 0 && (
                  <BotonMedio
                    testId="medio-paga-al-recibir"
                    icono="truck"
                    titulo="Paga al recibir"
                    detalle="El pedido queda pendiente y se cobra después"
                    disabled={sinTotal || guardando}
                    onClick={() => { setPagos(l => l.filter(pagoReal)); setPagaAlRecibir(true); irA('confirmar') }}
                  />
                )}
                <BotonMedio
                  testId="medio-otros"
                  icono="sliders"
                  titulo="Otros medios y entrega"
                  detalle="Dólares, canje, gift card, envío y nota"
                  disabled={guardando}
                  onClick={() => irA('mas')}
                />
              </div>
            )}

            {reales.length > 0 && saldo > 0 && (
              <button
                type="button"
                data-testid="cobro-pago-parcial"
                onClick={() => setParcialAbierto(true)}
                className="flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-fono-light"
              >
                Dejar el saldo pendiente
              </button>
            )}
          </>
        )}

        {paso === 'teclado' && (
          <div className="space-y-3" data-testid="cobro-teclado">
            <p className="text-center text-sm font-semibold text-mute">
              {teclado === 'recibido' ? `Pago: ${gs(aPagar)}` : `${etiquetaSaldo}: ${gs(saldo)}`}
            </p>
            <p data-testid="teclado-monto" className={cn('v2-numero whitespace-nowrap rounded-2xl border border-ink-600 bg-ink-800 px-4 py-6 text-center font-extrabold tabular-nums', tamanoImporte(gs(montoDeTeclado(digitos))))}>
              {gs(montoDeTeclado(digitos))}
            </p>
            <NumericKeypad
              value={digitos}
              onChange={setDigitos}
              max={12}
              className="grid w-full grid-cols-3 gap-2 [&>button]:min-h-16 [&>button]:text-2xl"
            />
            {teclado === 'recibido' && montoDeTeclado(digitos) > 0 && montoDeTeclado(digitos) < aPagar && (
              <p role="status" className="text-center text-sm font-semibold text-warn">Lo recibido no cubre el pago de {gs(aPagar)}.</p>
            )}
            {teclado === 'pago' && montoDeTeclado(digitos) > saldo && (
              <p role="status" className="text-center text-sm font-semibold text-warn">El pago no puede superar el saldo de {gs(saldo)}.</p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button type="button" variant="outline" className="min-h-14 text-base" onClick={() => (teclado === 'recibido' ? irA('recibido') : volverAMedios())}>
                Cancelar
              </Button>
              <Button
                type="button"
                data-testid="teclado-aceptar"
                className="min-h-14 text-base"
                disabled={(() => {
                  const monto = montoDeTeclado(digitos)
                  return teclado === 'recibido' ? monto < aPagar || monto <= 0 : monto <= 0 || monto > saldo
                })()}
                onClick={() => {
                  const monto = montoDeTeclado(digitos)
                  if (teclado === 'recibido') {
                    agregarPago(medio, aPagar, monto)
                    return
                  }
                  setMontoPago(monto >= saldo ? null : monto)
                  setDigitos('')
                  irA('medios')
                }}
              >
                Aceptar
              </Button>
            </div>
          </div>
        )}

        {paso === 'recibido' && medio && (
          <div className="space-y-4" data-testid="cobro-recibido">
            <div className="space-y-1 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-5">
              <Importe etiqueta="Monto recibido" valor={gs(aPagar)} testId="recibido-exacto-valor" />
            </div>
            <Button
              type="button"
              data-testid="recibido-exacto"
              className="min-h-14 w-full text-base"
              onClick={() => agregarPago(medio, aPagar, aPagar)}
            >
              Monto exacto
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="recibido-otro"
              className="min-h-14 w-full text-base"
              onClick={sinRebote(() => abrirTeclado('recibido', 0))}
            >
              Otro monto
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={sinRebote(volverAMedios)}>
              Cancelar
            </Button>
          </div>
        )}

        {paso === 'cuenta' && medio && (
          <div className="space-y-4" data-testid="cobro-cuenta">
            <div className="space-y-3 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-6 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-fono/10 text-fono-light">
                <Icon name={ICONO_MEDIO[medio.kind] || 'card'} className="h-6 w-6" />
              </span>
              <Importe etiqueta={medio.name} valor={gs(aPagar)} chico />
              <p className="text-sm text-mute">Confirmá cuando el pago ya esté acreditado.</p>
            </div>
            <Button
              type="button"
              data-testid="cuenta-marcar-pagado"
              className="min-h-14 w-full text-base"
              onClick={() => agregarPago(medio, aPagar)}
            >
              Marcar como pagado
            </Button>
            <Button type="button" variant="ghost" data-testid="cuenta-cancelar" className="min-h-14 w-full text-base font-bold text-bad-text" onClick={sinRebote(volverAMedios)}>
              Cancelar
            </Button>
          </div>
        )}

        {paso === 'confirmar' && (
          <div className="space-y-3" data-testid="cobro-confirmar">
            {vuelto > 0 && (
              <div role="status" data-testid="cobro-vuelto" className="rounded-2xl bg-ok px-4 py-3 text-center text-lg font-extrabold text-on-ok">
                Vuelto: <span className="tabular-nums">{gs(vuelto)}</span>
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-ink-600 bg-ink-800 p-4 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-mute">Total</span>
                <b className="v2-numero whitespace-nowrap text-xl tabular-nums" data-testid="confirmar-total">{gs(totalGeneral)}</b>
              </div>
              {pagaAlRecibir && <p className="text-mute">Paga al recibir: el pedido queda pendiente y se cobra desde Pedidos.</p>}
              {venderACredito && !pagaAlRecibir && <p className="text-mute">Venta a crédito del cliente.</p>}
              {pagos.map((p, i) => (pagoReal(p) ? (
                <div key={i} className="flex items-baseline justify-between gap-2 border-t border-ink-600 pt-2" data-testid={`confirmar-pago-${i}`}>
                  <span className="min-w-0 truncate text-mute">
                    {p.giftCardCode !== undefined ? 'Gift card' : p.cuenta || p.medioPago || `Pago ${i + 1}`}
                    {p.noPagado ? ' · no pagado' : ''}
                  </span>
                  <b className={cn('whitespace-nowrap tabular-nums', p.noPagado && 'text-warn')}>{gs(montoDeFila(p))}</b>
                </div>
              ) : null))}
              <div className="flex items-baseline justify-between gap-2 border-t border-ink-600 pt-2">
                <span className="text-mute">Pagado</span>
                <b className="whitespace-nowrap tabular-nums text-ok" data-testid="confirmar-pagado">{gs(totalPagado)}</b>
              </div>
              {pendiente > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-mute">Pendiente</span>
                  <b className="whitespace-nowrap tabular-nums text-warn" data-testid="confirmar-pendiente">{gs(pendiente)}</b>
                </div>
              )}
            </div>
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
            {!guardando && motivos.length > 0 && (
              <p role="status" className="text-xs font-semibold text-warn">Falta: {motivos.join(' · ')}</p>
            )}
            <Button
              type="submit"
              form="pos-venta-form"
              variant="primary"
              data-testid="cobro-confirmar-venta"
              className="h-auto min-h-14 w-full px-5 py-3 text-base"
              disabled={!valido || guardando || !cuentas || Boolean(errorCuentas) || guardadoIncompleto}
              onClick={event => { if (tocoRapido()) event.preventDefault() }}
            >
              <span className="font-bold">{etiquetaConfirmar}</span>
            </Button>
            {!completo && !pagaAlRecibir && !venderACredito && pendiente > 0 && (
              <Button type="button" variant="outline" className="min-h-12 w-full" onClick={volverAMedios}>
                Seguir cobrando el saldo
              </Button>
            )}
            {(pagaAlRecibir || venderACredito) && reales.length === 0 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                onClick={() => { setPagaAlRecibir(false); setVenderACredito(false); volverAMedios() }}
              >
                Elegir un medio de pago
              </Button>
            )}
          </div>
        )}

        {paso === 'mas' && <div data-testid="cobro-mas">{masContenido}</div>}
      </div>
    </BottomSheet>

      {parcialAbierto && (
        <BottomSheet
          open
          onClose={() => setParcialAbierto(false)}
          title="¿Marcar como pago parcial?"
          testId="cobro-parcial"
          footer={
            <div className="grid gap-2">
              <Button
                type="button"
                data-testid="parcial-confirmar"
                className="min-h-14 w-full text-base"
                onClick={() => { setParcialAbierto(false); irA('confirmar') }}
              >
                Marcar como pago parcial
              </Button>
              <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => setParcialAbierto(false)}>
                Seguir cobrando
              </Button>
            </div>
          }
        >
          <p className="text-sm text-mute">
            Quedan <b className="tabular-nums text-fore">{gs(saldo)}</b> sin cobrar. El pedido se crea con el pago parcial y el saldo se cobra después desde Pedidos.
          </p>
        </BottomSheet>
      )}
    </>
  )
}
