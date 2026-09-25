import { Input, Label, MoneyInput, Textarea } from '@/components/ui'
import { isDemoRuntime } from '@/lib/demoMode'
import CuentaCobroCombobox from './CuentaCobroCombobox'
import CapsulaCuentaCobro from './CapsulaCuentaCobro'
import { gs } from '@/utils/calculos'
import SerialField from '@/components/shared/SerialField'
import { api } from '@/lib/api/client'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { decimal, FOREIGN } from '@/utils/pagoCuenta'
import { useEffect, useRef } from 'react'

// Cotización referencial del dólar (misma fuente que Pagos): se pide una sola
// vez y se reutiliza; si el servicio no responde, la cotización queda manual.
let cotizacionEnCurso = null
export function cotizacionReferencial() {
  // Demo (#194): cotización ficticia fija, sin llamar al API real.
  if (isDemoRuntime) return Promise.resolve(7300)
  if (!cotizacionEnCurso) {
    cotizacionEnCurso = api
      .get('/api/fx')
      .then((data) => Number(data?.referencialDiario || data?.venta) || null)
      .catch(() => null)
  }
  return cotizacionEnCurso
}
export default function PaymentAccountFields({ payment, accounts, onChange, pendientePyg = 0 }) {
  const account = accounts.find((a) => a.id === payment.accountId)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  // Cotización automática para cuentas en USD: se pide una vez (con caché de la
  // API) y queda editable: es la sugerencia, no una obligación. Viaja marcada
  // como `automatico` para no pisar una cotización cargada a mano mientras la
  // consulta estaba en vuelo.
  useEffect(() => {
    if (account?.currency !== 'USD' || Number(payment.exchangeRatePyg) > 0) return undefined
    let vivo = true
    cotizacionReferencial().then((rate) => {
      if (vivo && rate > 0) onChangeRef.current({ exchangeRatePyg: String(rate), automatico: true })
    })
    return () => { vivo = false }
  }, [account?.currency, payment.exchangeRatePyg])
  // `grid-cols-1` explícito: en mobile la pista implícita es `auto` y el texto
  // largo de la cápsula ensancharía la tarjeta (el `w-full` del monto quedaba
  // clipeado). Con minmax(0,1fr) todo se ajusta al ancho disponible.
  return <div className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-600 bg-ink-800/40 p-3 sm:grid-cols-2 sm:col-span-3">
    <div className="sm:col-span-2">
      <Label htmlFor="cuenta-de-cobro">Cuenta de cobro</Label>
      <CuentaCobroCombobox
        value={payment.accountId || ''}
        accounts={accounts}
        onChange={(accountId) => {
          // Al elegir la cuenta se propone el saldo que falta, en la moneda de
          // la cuenta (así «dividir el pago» sale con un clic).
          const elegida = accounts.find((a) => a.id === accountId)
          const esPyg = !elegida || elegida.currency === 'PYG'
          const rate = esPyg ? 1 : decimal(payment.exchangeRatePyg)
          const propuesto = pendientePyg > 0 && rate > 0
            ? (esPyg ? String(Math.round(pendientePyg)) : (pendientePyg / rate).toFixed(2).replace('.', ','))
            : ''
          onChange({ accountId, originalAmount: propuesto, exchangeRatePyg: payment.exchangeRatePyg, tradeIn: undefined })
        }}
      />
      {account && <CapsulaCuentaCobro className="mt-2" account={account} pendientePyg={pendientePyg} cotizacionPyg={decimal(payment.exchangeRatePyg)} />}
    </div>
    <div className="sm:col-span-2"><Label htmlFor="monto-original">Monto original ({account?.currency || 'moneda de la cuenta'})</Label><MoneyInput id="monto-original" aria-label="Monto original" className="w-full" disabled={!account} max={LIMITE_MONTO_VENTAS} currency={account?.currency || 'PYG'} value={payment.originalAmount} onValueChange={(v) => onChange({ originalAmount: account?.currency === 'PYG' ? (v === '' ? '' : String(v)) : v })} placeholder={FOREIGN(account?.currency) ? '0,00' : '0'} /></div>
    {FOREIGN(account?.currency) && <div className="sm:col-span-2"><Label htmlFor="cotizacion-manual">Cotización (₲ por {account.currency}){account.currency === 'USD' ? ' · automática, editable' : ''}</Label><MoneyInput id="cotizacion-manual" aria-label={`Cotización manual ${account.currency} a PYG`} currency="USD" symbol="Gs." value={payment.exchangeRatePyg || ''} onValueChange={(v) => onChange({ exchangeRatePyg: v })} placeholder="Ingresar cotización" /></div>}
    <p className="rounded-lg border border-fono/20 bg-fono/5 px-3 py-2 text-sm sm:col-span-2">Equivalente: <b className="tabular-nums text-fore">{gs(Number(payment.monto) || 0)}</b></p>
    {account?.kind === 'TRADE_IN' && <>
      <div><Label htmlFor="serial-imei-del-canje">Serial / IMEI del canje *</Label><SerialField id="serial-imei-del-canje" aria-label="Serial del canje" value={payment.tradeIn?.serial || ''} onChange={(value) => onChange({ tradeIn: { ...payment.tradeIn, serial: value } })} /></div>
      <div><Label htmlFor="modelo-del-canje">Modelo del canje *</Label><Input id="modelo-del-canje" aria-label="Modelo del canje" value={payment.tradeIn?.model || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, model: e.target.value } })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="condicion-del-equipo-recibido">Condición del equipo recibido *</Label><Textarea id="condicion-del-equipo-recibido" aria-label="Condición del equipo recibido (obligatoria)" aria-required="true" rows={2} value={payment.tradeIn?.conditionNotes || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, conditionNotes: e.target.value } })} /></div>
    </>}
  </div>
}
