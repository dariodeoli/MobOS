import { Input, Label, MoneyInput, Textarea, useToast } from '@/components/ui'
import { isDemoRuntime } from '@/lib/demoMode'
import CuentaCobroCombobox from './CuentaCobroCombobox'
import BancoLogo from '@/components/shared/BancoLogo'
import MenuSecundario from '@/components/shared/MenuSecundario'
import { gs } from '@/utils/calculos'
import SerialField from '@/components/shared/SerialField'
import { cotizacionFx } from '@/lib/fx'
import { useSesion } from '@/lib/sesion'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { logoDeBanco } from '@/lib/bancosLogos'
import { cn } from '@/lib/utils'
import { copiarValor } from '@/utils/portapapeles'
import { etiquetaAlias, filasDeCuenta, textoDatosCuenta } from '@/utils/datosCuenta'
import { anchoMonto, cuentasCobrables, ordenarPorRecientes, recientesGuardados, recordarCuentaReciente } from '@/utils/cobroMedios'
import { etiquetaOrigen, origenAutomatico, origenManual } from '@/utils/cotizacion'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { avisoDesvioCotizacion, cambiarCuentaPago, errorCotizacion, FOREIGN } from '@/utils/pagoCuenta'
import { montoMaximoEnMoneda } from '@/utils/conversionPyg'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import ComprobantePago from './ComprobantePago'
import { filaPideComprobante } from '@/lib/comprobantePos'
import { usePoliticaVerificacion } from '@/lib/politicaVerificacion'

// Cotización del día para cobros (#401): fuente y lado de Configuración →
// Comercial (por defecto Cambios Chaco · compra: lo que favorece a la casa). Se pide con el caché de
// `lib/fx`; si el servicio no responde, la cotización queda manual.
export function cotizacionReferencial(currency = 'USD', opciones = {}) {
  // Demo (#194): cotización ficticia fija, sin llamar al API real.
  if (isDemoRuntime) return Promise.resolve({ rate: 7300, source: 'demo', sourceLabel: 'Demo', side: 'compra', updatedAt: null, fetchedAt: null, stale: false })
  return cotizacionFx({ purpose: 'sales', currency, ...opciones })
}
// La cotización automática conserva sus decimales (hasta 2); no se redondea a Gs enteros.
const tasaTexto = (rate) => String(Math.round(Number(rate) * 100) / 100)

const SIMBOLO = { PYG: 'Gs', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }
const ICONO_MEDIO = { CASH: 'money', TRANSFER: 'bank', CARD: 'card', PIX: 'qr', CRYPTO: 'wallet', TRADE_IN: 'refresh' }

function extrasDeCuenta(account) {
  const partes = []
  const dias = Number(account.settlementDays || 0)
  if (dias > 0) partes.push(`acredita en ${dias} día${dias === 1 ? '' : 's'}`)
  const comision = Number(account.feePercent || 0)
  if (comision > 0) partes.push(`comisión ${String(comision).replace('.', ',')}%`)
  const descuento = Number(account.discountPct || 0)
  if (descuento > 0) partes.push(`descuento ${String(descuento).replace('.', ',')}%`)
  return partes
}

// Cuentas del medio que se tocó en las tarjetas, las usadas hace poco primero.
function cuentasDelMedio(accounts, medio) {
  if (!medio) return []
  const cobrables = cuentasCobrables(accounts).filter(c => {
    if (medio === 'CASH') return c.kind === 'CASH' && c.currency === 'PYG'
    if (medio.startsWith('CASH-')) return c.kind === 'CASH' && c.currency === medio.slice(5)
    return c.kind === medio
  })
  return ordenarPorRecientes(cobrables, recientesGuardados())
}

export default function PaymentAccountFields({ payment, accounts, onChange, pendientePyg = 0, indice = 0, guardando = false, onDividir = null, onEliminar = null, onAlternarPagado = null }) {
  const account = accounts.find((a) => a.id === payment.accountId)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const { sesion } = useSesion() || {}
  const toast = useToast()
  // Medios que la empresa marca «verificar» (PIX, USDT, transferencia…): piden el comprobante en el mismo cobro.
  const politica = usePoliticaVerificacion()
  const pideComprobante = filaPideComprobante(politica, payment, accounts)
  const [sinCotizacion, setSinCotizacion] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const [datosAbiertos, setDatosAbiertos] = useState(false)
  const [buscando, setBuscando] = useState(false)
  // Cotización de hoy (referencia para avisar si la manual se aparta mucho).
  const [referencia, setReferencia] = useState(0)
  // Cotización automática para cuentas en USD: se pide una vez (con caché de la
  // API) y queda editable: es la sugerencia, no una obligación. Viaja marcada
  // como `automatico` para no pisar una cotización cargada a mano mientras la
  // consulta estaba en vuelo.
  useEffect(() => {
    if (!FOREIGN(account?.currency) || Number(payment.exchangeRatePyg) > 0) return undefined
    let vivo = true
    cotizacionReferencial(account.currency).then((info) => {
      if (!vivo) return
      if (!info || !(info.rate > 0)) { setSinCotizacion(true); return }
      setSinCotizacion(false)
      setReferencia(info.rate)
      const proponer = proponerAlLlegarCotizacion.current && String(montoRef.current || '') === '' && pendienteRef.current > 0
      proponerAlLlegarCotizacion.current = false
      onChangeRef.current({
        exchangeRatePyg: tasaTexto(info.rate),
        automatico: true,
        rateOrigin: origenAutomatico(info),
        ...(proponer ? { originalAmount: montoMaximoEnMoneda(pendienteRef.current, tasaTexto(info.rate)) } : {}),
      })
    })
    return () => { vivo = false }
  }, [account?.currency, payment.exchangeRatePyg])
  // Con cotización ya cargada (manual o de un borrador) igual se consulta la de
  // hoy, solo como referencia para el aviso de desvío.
  useEffect(() => {
    if (!FOREIGN(account?.currency) || !(Number(payment.exchangeRatePyg) > 0) || referencia > 0) return undefined
    let vivo = true
    cotizacionReferencial(account.currency).then((info) => { if (vivo && info?.rate > 0) setReferencia(info.rate) })
    return () => { vivo = false }
  }, [account?.currency, payment.exchangeRatePyg, referencia])
  // «Usar la del día»: acción explícita de la persona (sí reemplaza una cotización
  // manual); la consulta automática de arriba nunca lo hace.
  async function usarCotizacionDelDia() {
    if (actualizando || !account) return
    setActualizando(true)
    const info = await cotizacionReferencial(account.currency, { forzar: true })
    setActualizando(false)
    if (!info || !(info.rate > 0)) { setSinCotizacion(true); return }
    setSinCotizacion(false)
    setReferencia(info.rate)
    onChangeRef.current({ exchangeRatePyg: tasaTexto(info.rate), rateOrigin: origenAutomatico(info) })
  }
  const [cambiando, setCambiando] = useState(false)
  // Fila nueva por tarjeta de medio con la cuenta ya elegida en moneda
  // extranjera: el saldo se propone apenas llega la cotización automática.
  const proponerAlLlegarCotizacion = useRef(FOREIGN(account?.currency) && String(payment.originalAmount || '') === '' && pendientePyg > 0)
  const pendienteRef = useRef(pendientePyg)
  const montoRef = useRef(payment.originalAmount)
  useEffect(() => { pendienteRef.current = pendientePyg; montoRef.current = payment.originalAmount })
  const extranjera = FOREIGN(account?.currency)
  function elegir(accountId) {
    // Al elegir la cuenta se propone el saldo que falta, en la moneda de la
    // cuenta (así «dividir el pago» sale con un clic). Si ya había un monto
    // en la misma moneda (cambio de cuenta en el lugar), se conserva.
    const { cambio, proponerAlLlegarCotizacion: proponer } = cambiarCuentaPago(payment, accounts, accountId, pendientePyg)
    proponerAlLlegarCotizacion.current = proponer
    setCambiando(false)
    setBuscando(false)
    recordarCuentaReciente(accountId)
    onChange(cambio)
  }
  const sugeridas = account ? [] : cuentasDelMedio(accounts, payment.medioSugerido)

  // Un pago = UNA fila (escritorio): logo · cuenta (con «Medio · Moneda» chico)
  // · monto editable de ancho por contenido · estado · ⋯. En celular la fila
  // se parte en dos como máximo. Los datos para el cliente (alias, RUC…) van
  // detrás de ⋯ → «Ver datos para el cliente».
  const montoPyg = Number(payment.monto) || 0
  const puedeDividir = Boolean(account) && onDividir && !payment.noPagado && montoPyg > 0 && pendientePyg > 0
  const efectivoGs = account?.kind === 'CASH' && account?.currency === 'PYG'
  const recibido = Number(payment.montoRecibido) === montoPyg && Number(payment.recibido) > 0 ? Number(payment.recibido) : 0
  const campoMonto = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="pago-monto-bloque">
      <div className="min-w-[9rem] max-w-full flex-1 md:w-[var(--ancho-monto)] md:flex-none" style={{ '--ancho-monto': anchoMonto(payment.originalAmount, Boolean(extranjera)) }}>
        <MoneyInput id="monto-original" aria-label="Monto original" title={`Monto (${account?.currency || 'moneda'})`} className="h-10 w-full md:h-9" disabled={!account} max={LIMITE_MONTO_VENTAS} currency={account?.currency || 'PYG'} value={payment.originalAmount} onValueChange={(v) => onChange({ originalAmount: account?.currency === 'PYG' ? (v === '' ? '' : String(v)) : v })} placeholder={extranjera ? '0,00' : '0'} />
      </div>
      {puedeDividir && (
        <button type="button" data-testid="pago-dividir" className="toque-44 inline-flex h-11 items-center rounded-lg border border-fono/40 px-2.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10 md:h-8" onClick={onDividir} title={`Quedan ${gs(pendientePyg)} por cobrar: agrega otro pago con ese saldo`}>
          Dividir pago
        </button>
      )}
      {efectivoGs && montoPyg > 0 && !payment.noPagado && (
        <div className="hidden items-center gap-1.5 md:flex" data-testid="pago-recibido-bloque">
          <label htmlFor={`recibido-${indice}`} className="text-[11px] font-semibold text-mute">Recibido</label>
          <div className="w-[var(--ancho-monto)]" style={{ '--ancho-monto': anchoMonto(recibido || montoPyg, false) }}>
            <MoneyInput id={`recibido-${indice}`} aria-label="Recibido" className="h-10 w-full md:h-9" max={LIMITE_MONTO_VENTAS} value={recibido ? String(recibido) : ''} onValueChange={(v) => onChange(v === '' || Number(v) <= 0 ? { recibido: 0, montoRecibido: 0 } : { recibido: Number(v), montoRecibido: montoPyg })} placeholder={String(montoPyg)} />
          </div>
          {recibido > 0 && recibido < montoPyg && <span role="status" className="text-[11px] font-semibold text-warn">No cubre el pago</span>}
        </div>
      )}
      {extranjera && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="cotizacion-manual" className="text-[11px] font-semibold text-mute">Cotización</label>
          <MoneyInput id="cotizacion-manual" aria-label={`Cotización manual ${account.currency} a PYG`} currency="USD" decimalesFijos={false} symbol="Gs." className="h-10 w-32 md:h-9" max={999999} value={payment.exchangeRatePyg || ''} onValueChange={(v) => onChange({ exchangeRatePyg: v === '' || v == null ? '' : String(v), rateOrigin: v === '' || v == null ? undefined : origenManual(sesion?.nombre) })} placeholder="Ej. 7.300" />
          <span className="text-[11px] text-mute" data-testid="cotizacion-origen">
            {payment.rateOrigin && <span className={payment.rateOrigin.stale ? 'text-warn' : undefined}>{etiquetaOrigen(payment.rateOrigin)}</span>}
            {!payment.rateOrigin && sinCotizacion && <span>Sin cotización automática: cargala a mano.</span>}
            {(payment.rateOrigin?.manual || sinCotizacion) && <button type="button" data-testid="cotizacion-usar-del-dia" disabled={actualizando} onClick={usarCotizacionDelDia} className="toque-44 ml-2 font-semibold text-fono-light hover:underline disabled:opacity-40 md:min-h-0">{actualizando ? 'Consultando…' : 'Usar la del día'}</button>}
          </span>
          {(errorCotizacion(payment.exchangeRatePyg) || avisoDesvioCotizacion(payment.exchangeRatePyg, referencia)) && (
            <span role="alert" data-testid="cotizacion-aviso" className={`basis-full text-[11px] ${errorCotizacion(payment.exchangeRatePyg) ? 'text-bad-text' : 'text-warn'}`}>{errorCotizacion(payment.exchangeRatePyg) || avisoDesvioCotizacion(payment.exchangeRatePyg, referencia)}</span>
          )}
          <span className="text-[11px] text-mute">= <b className="tabular-nums text-fore">{gs(montoPyg)}</b></span>
        </div>
      )}
    </div>
  )
  const medio = account ? (KIND_LABELS[account.kind] || account.kind) : ''
  const moneda = account ? (account.currencyLabel || SIMBOLO[account.currency] || account.currency) : ''
  const conLogo = Boolean(account?.bank) && Boolean(logoDeBanco(account.bank))
  const filas = account ? filasDeCuenta(account) : []
  const extras = account ? extrasDeCuenta(account) : []
  const chipEstado = (
    <button
      type="button"
      data-testid="pago-estado"
      aria-pressed={!payment.noPagado}
      title={payment.noPagado ? 'Marcar como pagado' : 'Marcar como pendiente: no suma al cobrado y el saldo queda por cobrar'}
      disabled={guardando}
      onClick={onAlternarPagado}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border p-0 text-xs font-semibold transition disabled:opacity-50 md:h-auto md:min-h-8 md:w-auto md:px-2.5',
        payment.noPagado ? 'border-warn/40 bg-warn/10 text-warn' : 'border-ok/30 bg-ok/10 text-ok',
      )}
    >
      <Icon name={payment.noPagado ? 'alert' : 'check'} className="h-3.5 w-3.5" />
      <span className="sr-only md:not-sr-only">{payment.noPagado ? 'Pendiente' : 'Pagado'}</span>
    </button>
  )
  const accionesMenu = []
  if (account) accionesMenu.push({ label: 'Cambiar cuenta', icon: 'edit', testId: 'cuenta-cambiar', onClick: () => setCambiando(true), disabled: guardando })
  if (filas.length) {
    accionesMenu.push({ label: datosAbiertos ? 'Ocultar datos para el cliente' : 'Ver datos para el cliente', icon: 'eye', testId: 'cuenta-ver-datos', onClick: () => setDatosAbiertos(valor => !valor) })
    accionesMenu.push({ label: 'Copiar datos', icon: 'copy', testId: 'cuenta-copiar-datos', onClick: () => copiarValor(toast, textoDatosCuenta(account), 'Los datos de la cuenta') })
  }
  if (accionesMenu.length) accionesMenu.push({ separador: true })
  accionesMenu.push({ label: `Eliminar pago ${indice + 1}`, icon: 'trash', testId: 'pago-eliminar', onClick: onEliminar, disabled: guardando })
  const menu = (
    <MenuSecundario
      soloIcono
      direccion="abajo"
      etiqueta={`Más acciones del pago ${indice + 1}`}
      ariaLabel={`Acciones del pago ${indice + 1}`}
      acciones={accionesMenu}
    />
  )
  return <div className="grid grid-cols-1 gap-2 sm:col-span-full">
    <div>
      {account && !cambiando ? (
        <div data-testid="cuenta-capsula" className="rounded-xl border border-fono/25 bg-fono/5 px-2.5 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="order-1 grid h-9 w-9 min-w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-600 bg-ink-800 px-1">
              {conLogo ? <BancoLogo banco={account.bank} alto="h-4" /> : <Icon name={ICONO_MEDIO[account.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
            </span>
            <div className="order-2 min-w-0 flex-1 basis-[calc(100%-10.5rem)] md:basis-32">
              <b className="block break-words text-sm leading-5 text-fore [overflow-wrap:anywhere]" title={account.name} data-testid="cuenta-capsula-nombre">{account.name}</b>
              <span data-testid="cuenta-tipo" className="block break-words text-[11px] font-semibold leading-4 text-mute">{medio} · {moneda}</span>
            </div>
            {/* Celular: renglón 1 = logo, cuenta, estado (solo ícono) y ⋯; renglón 2 = monto.
                Escritorio: todo en una fila (logo, cuenta, monto, estado, ⋯). */}
            <div className="order-5 min-w-0 basis-full md:order-3 md:basis-auto">{campoMonto}</div>
            <div className="order-3 ml-auto shrink-0 md:order-4">{chipEstado}</div>
            <div className="order-4 shrink-0 md:order-5">{menu}</div>
          </div>
          {datosAbiertos && (filas.length > 0 || extras.length > 0) && (
            <div data-testid="cuenta-datos-cliente" className="mt-1.5 border-t border-fono/15 pt-1.5">
              {account.aliasValue && <p data-testid="cuenta-alias" className="mb-1 text-xs text-mute">{etiquetaAlias(account)}: <b className="font-semibold text-fore">{account.aliasValue}</b></p>}
              <dl data-testid="cuenta-capsula-datos" className="space-y-0.5">
                {filas.map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-mute">{etiqueta}</dt>
                    <dd className="min-w-0 truncate text-right text-xs text-fore" title={valor}>{valor}</dd>
                  </div>
                ))}
              </dl>
              {extras.length > 0 && <p className="mt-0.5 text-[11px] text-mute">{extras.join(' · ')}</p>}
            </div>
          )}
        </div>
      ) : (
        <div data-testid="pago-elegir-cuenta" className="rounded-xl border border-dashed border-ink-500 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label htmlFor="cuenta-de-cobro" className="mb-0">Cuenta de cobro</Label>
            <div className="flex items-center gap-1.5">
              {cambiando && <button type="button" className="toque-44 min-h-11 px-2 text-xs font-semibold text-fono-light hover:underline md:min-h-8" onClick={() => setCambiando(false)}>Cancelar</button>}
              {!account && menu}
            </div>
          </div>
          {sugeridas.length > 0 && !buscando ? (
            <div data-testid="pago-cuentas-sugeridas" className="flex flex-wrap items-center gap-1.5">
              {sugeridas.map(cuenta => (
                <button
                  key={cuenta.id}
                  type="button"
                  data-testid={`cuenta-opcion-${cuenta.id}`}
                  onClick={() => elegir(cuenta.id)}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 text-sm font-semibold text-fore transition hover:border-fono md:min-h-9"
                >
                  {cuenta.bank && logoDeBanco(cuenta.bank) ? <BancoLogo banco={cuenta.bank} alto="h-4" /> : <Icon name={ICONO_MEDIO[cuenta.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
                  <span className="min-w-0 truncate">{cuenta.name}</span>
                </button>
              ))}
              <button type="button" className="toque-44 min-h-11 px-2 text-xs font-semibold text-fono-light hover:underline md:min-h-9" onClick={() => setBuscando(true)}>Otra cuenta…</button>
            </div>
          ) : (
            <CuentaCobroCombobox
              value={payment.accountId || ''}
              accounts={accounts}
              onChange={elegir}
            />
          )}
          {!account && <div className="mt-1">{campoMonto}</div>}
        </div>
      )}
    </div>
    {pideComprobante && <ComprobantePago comprobante={payment.comprobante} obligatorio={Boolean(politica?.requireProof)} indice={indice} disabled={guardando} onChange={(comprobante) => onChange({ comprobante })} />}
    {account?.kind === 'TRADE_IN' && <>
      <div><Label htmlFor="serial-imei-del-canje">Serial / IMEI del canje *</Label><SerialField id="serial-imei-del-canje" aria-label="Serial del canje" value={payment.tradeIn?.serial || ''} onChange={(value) => onChange({ tradeIn: { ...payment.tradeIn, serial: value } })} /></div>
      <div><Label htmlFor="modelo-del-canje">Modelo del canje *</Label><Input id="modelo-del-canje" aria-label="Modelo del canje" value={payment.tradeIn?.model || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, model: e.target.value } })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="condicion-del-equipo-recibido">Condición del equipo recibido *</Label><Textarea id="condicion-del-equipo-recibido" aria-label="Condición del equipo recibido (obligatoria)" aria-required="true" rows={2} value={payment.tradeIn?.conditionNotes || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, conditionNotes: e.target.value } })} /></div>
    </>}
  </div>
}
