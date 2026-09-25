import BancoLogo from '@/components/shared/BancoLogo'
import Icon from '@/components/shared/Icon'
import { CELDA_DATO } from '@/components/shared/tabla'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { logoDeBanco } from '@/lib/bancosLogos'
import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'

// Cápsula resumida de la cuenta de cobro elegida (#148 §5/§11): al elegir una
// cuenta el vendedor ve de un vistazo con qué está cobrando —logo del banco o
// ícono del medio, nombre, medio, moneda— y los datos que sirven para operar
// (titular, número de cuenta, llave Pix, referencia o procesadora). Si la venta
// todavía tiene saldo, muestra cuánto falta cobrar; si la cuenta es en moneda
// extranjera, el equivalente con la cotización de la fila.
const SIMBOLO = { PYG: 'Gs', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }
const ICONO_MEDIO = { CASH: 'money', TRADE_IN: 'refresh' }

const numero = (valor) => {
  const limpio = String(valor ?? '').replace(/\s+/g, '')
  return limpio
}

function datosDeCuenta(account) {
  const partes = []
  if (account.bank) partes.push(account.bank)
  if (account.kind === 'CARD' && account.processor) partes.push(account.processor)
  if (account.holder) partes.push(`Titular ${account.holder}`)
  if (account.kind === 'TRANSFER' && account.accountNumber) partes.push(`Nro ${numero(account.accountNumber)}`)
  else if (account.accountNumber) partes.push(numero(account.accountNumber))
  if (account.kind === 'PIX' && account.pixKey) partes.push(`Llave ${account.pixKey}`)
  if (account.kind === 'CRYPTO' && account.reference) partes.push(account.reference)
  if (['CASH', 'TRADE_IN'].includes(account.kind) && account.reference) partes.push(account.reference)
  if (account.kind === 'TRANSFER' && account.document) partes.push(`CI/RUC ${account.document}`)
  return partes
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

export default function CapsulaCuentaCobro({ account, pendientePyg = 0, cotizacionPyg = 0, className }) {
  if (!account) return null
  const medio = KIND_LABELS[account.kind] || account.kind
  const moneda = account.currencyLabel || SIMBOLO[account.currency] || account.currency
  const datos = datosDeCuenta(account)
  const extras = extrasDeCuenta(account)
  // Saldo de la venta (en la moneda de la cuenta cuando hay cotización).
  const pendiente = Math.max(0, Number(pendientePyg) || 0)
  const cotizacion = Number(cotizacionPyg) || 0
  const equivalente = account.currency !== 'PYG' && cotizacion > 0 ? pendiente / cotizacion : null
  const conLogo = Boolean(account.bank) && Boolean(logoDeBanco(account.bank))

  return (
    <div
      data-testid="cuenta-capsula"
      className={cn('flex items-start gap-2.5 rounded-xl border border-fono/25 bg-fono/5 px-3 py-2', className)}
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ink-600 bg-ink-800">
        {conLogo
          ? <BancoLogo banco={account.bank} alto="h-4" />
          : <Icon name={ICONO_MEDIO[account.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="truncate text-sm text-fore" data-testid="cuenta-capsula-nombre">{account.name}</b>
          <span className="rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">{moneda}</span>
          <span className="text-[11px] font-semibold text-mute">{medio}</span>
        </div>
        {(datos.length > 0 || extras.length > 0) && (
          <p className={cn('mt-0.5', CELDA_DATO)} data-testid="cuenta-capsula-datos">
            {[...datos, ...extras].join(' · ')}
          </p>
        )}
        {pendiente > 0 && (
          <p className="mt-1 text-xs text-mute" data-testid="cuenta-capsula-saldo">
            Saldo pendiente de esta venta:{' '}
            <b className="tabular-nums text-warn">{gs(pendiente)}</b>
            {equivalente !== null && (
              <span className="text-mute">
                {' '}· {moneda} {equivalente.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
