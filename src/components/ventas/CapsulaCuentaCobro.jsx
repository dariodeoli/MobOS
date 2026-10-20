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

export default function CapsulaCuentaCobro({ account, className, acciones = null, accionesSecundarias = null, children = null }) {
  const toast = useToast()
  if (!account) return null
  const medio = KIND_LABELS[account.kind] || account.kind
  const moneda = account.currencyLabel || SIMBOLO[account.currency] || account.currency
  const filas = filasDeCuenta(account)
  const extras = extrasDeCuenta(account)
  const conLogo = Boolean(account.bank) && Boolean(logoDeBanco(account.bank))

  // #632: identificación y edición primero; tipo y estado en su propia fila.
  // El nombre puede crecer sin competir con las acciones. Conservamos
  // los datos para pasarle al cliente detrás de «Ver datos para el cliente».
  return (
    <div
      data-testid="cuenta-capsula"
      className={cn('rounded-xl border border-fono/25 bg-fono/5 px-2.5 py-1', className)}
    >
      <div data-testid="cuenta-cabecera" className="flex items-start gap-2.5">
        <span className="mt-1.5 grid h-8 w-8 min-w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-600 bg-ink-800 px-1">
          {conLogo
            ? <BancoLogo banco={account.bank} alto="h-4" />
            : <Icon name={ICONO_MEDIO[account.kind] || 'wallet'} className="h-4 w-4 text-fono-light" />}
        </span>
        <div className="min-w-0 flex-1 py-2">
          <b className="block break-words text-sm leading-5 text-fore [overflow-wrap:anywhere]" data-testid="cuenta-capsula-nombre">{account.name}</b>
        </div>
        {acciones && <div className="shrink-0">{acciones}</div>}
      </div>
      <div data-testid="cuenta-metadatos" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-fono/15 pt-1">
        <span data-testid="cuenta-tipo" className="min-w-0 break-words text-xs font-semibold text-mute">{moneda} · {medio}</span>
        {accionesSecundarias && <div data-testid="cuenta-estado-acciones" className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{accionesSecundarias}</div>}
      </div>
      {children}
      {(filas.length > 0 || extras.length > 0) && (
        <details className="mt-0.5">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 text-xs font-semibold text-fono-light hover:underline md:min-h-6">
            <span>Ver datos para el cliente</span>
            {filas.length > 0 && (
              <button
                type="button"
                data-testid="cuenta-copiar-datos"
                className="toque-44 inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-fono-light hover:bg-ink-700"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); copiarValor(toast, textoDatosCuenta(account), 'Los datos de la cuenta') }}
              >
                <Icon name="copy" className="h-3.5 w-3.5" />Copiar datos
              </button>
            )}
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
