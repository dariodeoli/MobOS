import { Input, Label, MoneyInput, Textarea } from '@/components/ui'
import { isDemoRuntime } from '@/lib/demoMode'
import CuentaCobroCombobox from './CuentaCobroCombobox'
import CapsulaCuentaCobro from './CapsulaCuentaCobro'
import { gs } from '@/utils/calculos'
import SerialField from '@/components/shared/SerialField'
import { cotizacionFx } from '@/lib/fx'
import { useSesion } from '@/lib/sesion'
import { etiquetaOrigen, origenAutomatico, origenManual } from '@/utils/cotizacion'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { cambiarCuentaPago, FOREIGN } from '@/utils/pagoCuenta'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'

// Cotización del día para cobros (#401): fuente y lado de Configuración →
// Comercial (por defecto Cambios Chaco · venta). Se pide con el caché de
// `lib/fx`; si el servicio no responde, la cotización queda manual.
export function cotizacionReferencial(currency = 'USD', opciones = {}) {
  // Demo (#194): cotización ficticia fija, sin llamar al API real.
  if (isDemoRuntime) return Promise.resolve({ rate: 7300, source: 'demo', sourceLabel: 'Demo', side: 'venta', updatedAt: null, fetchedAt: null, stale: false })
  return cotizacionFx({ purpose: 'sales', currency, ...opciones })
}
export default function PaymentAccountFields({ payment, accounts, onChange, pendientePyg = 0 }) {
  const account = accounts.find((a) => a.id === payment.accountId)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const { sesion } = useSesion() || {}
  const [sinCotizacion, setSinCotizacion] = useState(false)
  const [actualizando, setActualizando] = useState(false)
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
      const proponer = proponerAlLlegarCotizacion.current && String(montoRef.current || '') === '' && pendienteRef.current > 0
      proponerAlLlegarCotizacion.current = false
      onChangeRef.current({
        exchangeRatePyg: String(info.rate),
        automatico: true,
        rateOrigin: origenAutomatico(info),
        ...(proponer ? { originalAmount: (pendienteRef.current / info.rate).toFixed(2).replace('.', ',') } : {}),
      })
    })
    return () => { vivo = false }
  }, [account?.currency, payment.exchangeRatePyg])
  // «Usar la del día»: acción explícita de la persona (sí reemplaza una cotización
  // manual); la consulta automática de arriba nunca lo hace.
  async function usarCotizacionDelDia() {
    if (actualizando || !account) return
    setActualizando(true)
    const info = await cotizacionReferencial(account.currency, { forzar: true })
    setActualizando(false)
    if (!info || !(info.rate > 0)) { setSinCotizacion(true); return }
    setSinCotizacion(false)
    onChangeRef.current({ exchangeRatePyg: String(info.rate), rateOrigin: origenAutomatico(info) })
  }
  const [cambiando, setCambiando] = useState(false)
  const proponerAlLlegarCotizacion = useRef(false)
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
    onChange(cambio)
  }
  // `grid-cols-1` explícito: en mobile la pista implícita es `auto` y el texto
  // largo de la cápsula ensancharía la tarjeta (el `w-full` del monto quedaba
  // clipeado). Con minmax(0,1fr) todo se ajusta al ancho disponible.
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:col-span-full">
    <div className="sm:col-span-2">
      {account && !cambiando ? (
        /* #391: la cuenta elegida es una fila compacta; cambiarla es en el
           lugar (sin eliminar el pago) y sus datos van detrás de «Ver datos
           para el cliente». */
        <CapsulaCuentaCobro
          account={account}
          acciones={
            <button
              type="button"
              data-testid="cuenta-cambiar"
              className="toque-44 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore md:h-8 md:w-8"
              title="Cambiar cuenta"
              aria-label="Cambiar cuenta"
              onClick={() => setCambiando(true)}
            >
              <Icon name="edit" className="h-4 w-4" />
            </button>
          }
        />
      ) : (
        <>
          <Label htmlFor="cuenta-de-cobro">Cuenta de cobro</Label>
          <CuentaCobroCombobox
            value={payment.accountId || ''}
            accounts={accounts}
            onChange={elegir}
          />
        </>
      )}
    </div>
    <div><Label htmlFor="monto-original">Monto original ({account?.currency || 'moneda de la cuenta'})</Label><MoneyInput id="monto-original" aria-label="Monto original" className="w-full" disabled={!account} max={LIMITE_MONTO_VENTAS} currency={account?.currency || 'PYG'} value={payment.originalAmount} onValueChange={(v) => onChange({ originalAmount: account?.currency === 'PYG' ? (v === '' ? '' : String(v)) : v })} placeholder={extranjera ? '0,00' : '0'} /></div>
    {extranjera && <div>
      <Label htmlFor="cotizacion-manual">Cotización (₲ por {account.currency})</Label>
      <MoneyInput id="cotizacion-manual" aria-label={`Cotización manual ${account.currency} a PYG`} currency="USD" symbol="Gs." value={payment.exchangeRatePyg || ''} onValueChange={(v) => onChange({ exchangeRatePyg: v, rateOrigin: v === '' || v == null ? undefined : origenManual(sesion?.nombre) })} placeholder="Ingresar cotización" />
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-mute" data-testid="cotizacion-origen">
        {payment.rateOrigin && <span className={payment.rateOrigin.stale ? 'text-warn' : undefined}>{etiquetaOrigen(payment.rateOrigin)}</span>}
        {!payment.rateOrigin && sinCotizacion && <span>Sin cotización automática: cargala a mano.</span>}
        {(payment.rateOrigin?.manual || sinCotizacion) && <button type="button" data-testid="cotizacion-usar-del-dia" disabled={actualizando} onClick={usarCotizacionDelDia} className="toque-44 font-semibold text-fono-light hover:underline disabled:opacity-40 md:min-h-0">{actualizando ? 'Consultando…' : 'Usar la del día'}</button>}
      </p>
    </div>}
    {/* El equivalente solo aporta cuando la cuenta no es en guaraníes. */}
    {extranjera && <p className="rounded-lg border border-fono/20 bg-fono/5 px-3 py-1.5 text-sm sm:col-span-2">Equivalente: <b className="tabular-nums text-fore">{gs(Number(payment.monto) || 0)}</b></p>}
    {account?.kind === 'TRADE_IN' && <>
      <div><Label htmlFor="serial-imei-del-canje">Serial / IMEI del canje *</Label><SerialField id="serial-imei-del-canje" aria-label="Serial del canje" value={payment.tradeIn?.serial || ''} onChange={(value) => onChange({ tradeIn: { ...payment.tradeIn, serial: value } })} /></div>
      <div><Label htmlFor="modelo-del-canje">Modelo del canje *</Label><Input id="modelo-del-canje" aria-label="Modelo del canje" value={payment.tradeIn?.model || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, model: e.target.value } })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="condicion-del-equipo-recibido">Condición del equipo recibido *</Label><Textarea id="condicion-del-equipo-recibido" aria-label="Condición del equipo recibido (obligatoria)" aria-required="true" rows={2} value={payment.tradeIn?.conditionNotes || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, conditionNotes: e.target.value } })} /></div>
    </>}
  </div>
}
