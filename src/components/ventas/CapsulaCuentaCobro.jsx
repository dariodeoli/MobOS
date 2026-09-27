import BancoLogo from '@/components/shared/BancoLogo'
import Icon from '@/components/shared/Icon'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { logoDeBanco } from '@/lib/bancosLogos'
import { cn } from '@/lib/utils'

// Tarjeta de la cuenta de cobro elegida (#148 §5/§11, reordenada en #283): al
// elegir la cuenta el buscador desaparece y queda esta cápsula con todo lo que
// hace falta para operar, en orden y con rótulos: número de cuenta, titular,
// banco/procesadora, llave o referencia y CI/RUC; arriba, nombre, moneda, medio
// y logo. Para cambiar de cuenta se elimina el pago y se agrega otro.
const SIMBOLO = { PYG: 'Gs', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }
const ICONO_MEDIO = { CASH: 'money', TRADE_IN: 'refresh' }

const numero = (valor) => String(valor ?? '').replace(/\s+/g, '')

// Datos ordenados: primero el número, después el titular y el banco/procesadora
// (Dario, #283); llave, referencia y CI/RUC completan cuando aplican.
function filasDeCuenta(account) {
  const filas = []
  if (account.accountNumber) filas.push(['Nro de cuenta', numero(account.accountNumber)])
  if (account.holder) filas.push(['Titular', account.holder])
  if (account.kind === 'CARD' && account.processor) filas.push(['Procesadora', account.processor])
  else if (account.bank) filas.push(['Banco', account.bank])
  if (account.pixKey) filas.push(['Llave Pix', account.pixKey])
  if (account.reference) filas.push(['Referencia', account.reference])
  if (account.kind === 'TRANSFER' && account.document) filas.push(['CI/RUC', account.document])
  return filas
}

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

export default function CapsulaCuentaCobro({ account, className }) {
  if (!account) return null
  const medio = KIND_LABELS[account.kind] || account.kind
  const moneda = account.currencyLabel || SIMBOLO[account.currency] || account.currency
  const filas = filasDeCuenta(account)
  const extras = extrasDeCuenta(account)
  const conLogo = Boolean(account.bank) && Boolean(logoDeBanco(account.bank))

  return (
    <div
      data-testid="cuenta-capsula"
      className={cn('rounded-xl border border-fono/25 bg-fono/5 px-3 py-2', className)}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ink-600 bg-ink-800">
          {conLogo
            ? <BancoLogo banco={account.bank} alto="h-4" />
            : <Icon name={ICONO_MEDIO[account.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="truncate text-sm text-fore" data-testid="cuenta-capsula-nombre">{account.name}</b>
            <span className="rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">{moneda}</span>
            <span className="rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">{medio}</span>
          </div>
          {filas.length > 0 && (
            <dl data-testid="cuenta-capsula-datos" className="mt-1.5 space-y-0.5">
              {filas.map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-mute">{etiqueta}</dt>
                  <dd className="min-w-0 truncate text-right text-xs text-fore" title={valor}>{valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {extras.length > 0 && <p className="mt-1 text-[11px] text-mute">{extras.join(' · ')}</p>}
        </div>
      </div>
    </div>
  )
}
