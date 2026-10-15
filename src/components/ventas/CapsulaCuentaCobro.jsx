import BancoLogo from '@/components/shared/BancoLogo'
import Icon from '@/components/shared/Icon'
import { KIND_LABELS } from '@/lib/paymentAccounts'
import { logoDeBanco } from '@/lib/bancosLogos'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui'
import { copiarValor } from '@/utils/portapapeles'
import { etiquetaAlias, filasDeCuenta, textoDatosCuenta } from '@/utils/datosCuenta'

// Tarjeta de la cuenta de cobro elegida (#148 §5/§11, reordenada en #283): al
// elegir la cuenta el buscador desaparece y queda esta cápsula con todo lo que
// hace falta para operar, en orden y con rótulos: número de cuenta, titular,
// banco/procesadora, llave o referencia y CI/RUC; arriba, nombre, moneda, medio
// y logo. Para cambiar de cuenta se elimina el pago y se agrega otro.
const SIMBOLO = { PYG: 'Gs', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }
const ICONO_MEDIO = { CASH: 'money', TRADE_IN: 'refresh' }

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

export default function CapsulaCuentaCobro({ account, className, acciones = null, children = null }) {
  const toast = useToast()
  if (!account) return null
  const medio = KIND_LABELS[account.kind] || account.kind
  const moneda = account.currencyLabel || SIMBOLO[account.currency] || account.currency
  const filas = filasDeCuenta(account)
  const extras = extrasDeCuenta(account)
  const conLogo = Boolean(account.bank) && Boolean(logoDeBanco(account.bank))

  // #391: una fila compacta (logo sin solaparse con el texto, moneda y medio) y
  // los datos para pasarle al cliente detrás de «Ver datos para el cliente».
  return (
    <div
      data-testid="cuenta-capsula"
      className={cn('rounded-xl border border-fono/25 bg-fono/5 px-2.5 py-1', className)}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 min-w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-600 bg-ink-800 px-1">
          {conLogo
            ? <BancoLogo banco={account.bank} alto="h-4" />
            : <Icon name={ICONO_MEDIO[account.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <b className="min-w-0 truncate text-sm text-fore" data-testid="cuenta-capsula-nombre">{account.name}</b>
          <span className="whitespace-nowrap rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">{moneda} · {medio}</span>
        </div>
        {filas.length > 0 && (
          <button
            type="button"
            data-testid="cuenta-copiar-datos"
            className="toque-44 inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-fono-light transition hover:bg-ink-700 md:h-8"
            onClick={() => copiarValor(toast, textoDatosCuenta(account), 'Los datos de la cuenta')}
          >
            <Icon name="copy" className="h-3.5 w-3.5" />Copiar datos
          </button>
        )}
        {acciones}
      </div>
      {children}
      {(filas.length > 0 || extras.length > 0) && (
        <details className="mt-0.5">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 text-xs font-semibold text-fono-light hover:underline md:min-h-6">
            <span>Ver datos para el cliente</span>
            {account.aliasValue && <span data-testid="cuenta-alias" className="min-w-0 truncate font-normal text-mute" title={`${etiquetaAlias(account)}: ${account.aliasValue}`}>{etiquetaAlias(account)}: <b className="font-semibold text-fore">{account.aliasValue}</b></span>}
          </summary>
          {filas.length > 0 && (
            <dl data-testid="cuenta-capsula-datos" className="space-y-0.5 pb-1">
              {filas.map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-mute">{etiqueta}</dt>
                  <dd className="min-w-0 truncate text-right text-xs text-fore" title={valor}>{valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {extras.length > 0 && <p className="pb-1 text-[11px] text-mute">{extras.join(' · ')}</p>}
        </details>
      )}
    </div>
  )
}
