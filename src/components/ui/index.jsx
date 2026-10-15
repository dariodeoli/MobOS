import { useState } from 'react'
import { Input, TAMANOS_CAMPO } from 'owncoding-ui'
// Los helpers de dinero salen del módulo del repo, no de la biblioteca: desde
// la migración bigint de §9 (#278) los topes reales son 10B general / 99B
// ventas y la biblioteca todavía acota al techo de 32 bits.
import {
  LIMITE_MONTO_GENERAL,
  borradorDecimal,
  valorNormalizado,
  excedeMonto,
  formatGsInput,
  formatUsdInput,
  largoMaximoMonto,
  limiteMonto,
  parseGsInput,
} from '@/utils/moneda'
import { cn } from '@/lib/utils'

// ── Kit compartido (#253) ───────────────────────────────────────────
// La mayoría de los objetos vive en `owncoding-ui` y acá se re-exporta para
// conservar la ruta histórica `@/components/ui`: los consumidores no cambian.
// `Modal`/`Drawer` se adoptaron en #323: el objeto de la biblioteca trae
// header/cuerpo/pie estándar, bloqueo por `busy`/pendiente y cierre con
// confirmación de cambios (`dirty`/`useDialogDirty`). Quedan locales solo los
// que tienen una decisión de diseño pendiente con DSN: `Card` (radio),
// `MoneyInput` (símbolo «Gs.») y `Stat` (delta sin flechas).
export {
  Aviso,
  Badge,
  BarraProgreso,
  Button,
  CeldaMoneda,
  ConfirmDialog,
  DataTable,
  DocumentoImpresion,
  Dot,
  Drawer,
  EmptyState,
  ErrorState,
  Eyebrow,
  FilaDato,
  FormActions,
  FormField,
  IconAction,
  Input,
  Label,
  MenuDesplegable,
  Modal,
  Money,
  Nota,
  PageHeader,
  PasswordInput,
  PinInput,
  SaveActions,
  Select,
  Skeleton,
  Subtabs,
  Textarea,
  ToastProvider,
  useDialogClose,
  useDialogDirty,
  useDialogPending,
  useResultado,
  useToast,
  useValidacionCampos,
} from 'owncoding-ui'

// ── Card (local: radio del tema pendiente con DSN) ──────────────────
export function Card({ className, ...props }) {
  return (
    <div className={cn('rounded-xl border border-ink-600 bg-ink p-5 shadow-card', className)} {...props} />
  )
}

// ── MoneyInput (local: el símbolo «Gs.» espera decisión de diseño) ──
const MONEY_SYMBOL = { PYG: 'Gs.', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }

export function MoneyInput({ currency = 'PYG', symbol, decimalesFijos = true, value, onValueChange, className, max = LIMITE_MONTO_GENERAL, maxLength, ...props }) {
  const isPyg = currency === 'PYG'
  const prefix = symbol || MONEY_SYMBOL[currency] || currency
  // Monedas con decimales: mientras se escribe se muestra el borrador tipeado
  // (formatear «1» como «1,00» en cada tecla comía los dígitos siguientes).
  const [borrador, setBorrador] = useState(null)
  const borradorVigente = !isPyg && borrador !== null && borradorDecimal(borrador).valor === valorNormalizado(value)
  const display = isPyg ? formatGsInput(value) : borradorVigente ? borradorDecimal(borrador).texto : formatUsdInput(value, { decimalesFijos })
  const limite = limiteMonto(max)
  const excede = excedeMonto(value, limite)
  // Largo máximo del campo: el monto más grande documentado (con separadores)
  // entra completo y no se puede escribir de más; se puede pisar por prop.
  const topeLargo = maxLength ?? largoMaximoMonto(max, { decimales: !isPyg })
  // El prefijo es una ayuda visual, no parte del valor: va chico y claro para no
  // comerse el ancho del número (montos grandes se cortaban con «Gs.» a 12px y
  // pl-12; ahora pl-8/pl-11 con el prefijo a 9-10px). El valor conserva todo el
  // espacio posible del campo. El color queda en `text-mute` (el auditor AA
  // exige 4.5:1 en texto chico: atenuarlo más no pasa).
  const prefijoLargo = prefix.length > 3
  return (
    <div className="relative">
      <span className={cn('pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 font-medium text-mute', prefijoLargo ? 'left-2 text-[9px]' : 'left-2.5 text-[10px]')}>
        {prefix}
      </span>
      <Input
        {...props}
        aria-invalid={excede || undefined}
        title={excede ? `El monto supera el máximo permitido (${limite.toLocaleString('es-PY')})` : props.title}
        inputMode={isPyg ? 'numeric' : 'decimal'}
        maxLength={topeLargo}
        value={display}
        onBlur={(event) => { setBorrador(null); props.onBlur?.(event) }}
        onChange={(event) => {
          let next = event.target.value.replace(/[^\d.,]/g, '')
          if (isPyg) { onValueChange?.(next.trim() ? parseGsInput(next) : ''); return }
          // Un punto TIPEADO (teclado numérico) es el decimal; los puntos del
          // formato son de miles.
          if (event.nativeEvent?.data === '.' && !next.includes(',')) next = `${next.slice(0, next.lastIndexOf('.'))},${next.slice(next.lastIndexOf('.') + 1)}`
          const { texto, valor } = borradorDecimal(next)
          setBorrador(texto)
          onValueChange?.(valor)
        }}
        className={cn(TAMANOS_CAMPO.moneda, prefijoLargo ? 'pl-11' : 'pl-8', 'tabular-nums', className)}
      />
    </div>
  )
}

// ── Stat (local: delta sin flechas, pendiente con DSN) ──────────────
// `compact`: celda de la tira de KPI de una línea (`StatGrid`).
export function Stat({ label, valor, delta, sub, destacado = false, compact = false, className, testId, valorClassName, ...resto }) {
  const sube = typeof delta === 'number' && delta >= 0
  if (compact) {
    // Celda de la tira de KPI (#388): «etiqueta + cifra» en UNA línea, etiqueta
    // 12px, cifra 16px semibold tabular. `sub` solo se pasa si aporta un dato
    // distinto (un importe, un contador): nunca para repetir el título.
    return (
      <div
        data-testid={testId}
        title={typeof sub === 'string' ? `${label}: ${sub}` : undefined}
        {...resto}
        className={cn(
          'flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 border-r px-3 py-1.5 last:border-r-0 sm:min-w-0 sm:flex-1',
          destacado ? 'border-fono/30 bg-gradient-to-br from-fono-dark via-fono to-fono' : 'border-ink-600',
          className,
        )}
      >
        <span className={cn('whitespace-nowrap text-xs font-medium leading-4', destacado ? 'text-onbrand/75' : 'text-mute')}>{label}</span>
        <span className={cn('whitespace-nowrap text-base font-semibold leading-6 tabular-nums v2-numero', destacado ? 'text-onbrand' : 'text-fore', valorClassName)}>
          {valor}
        </span>
        {typeof delta === 'number' && (
          <span className={cn('shrink-0 text-xs font-medium leading-4', sube ? 'text-ok-text' : 'text-bad-text')}>{Math.abs(delta).toFixed(1)}%</span>
        )}
        {sub && <span className={cn('whitespace-nowrap text-xs leading-4', destacado ? 'text-onbrand/75' : 'text-mute')}>{sub}</span>}
      </div>
    )
  }
  return (
    <div
      data-testid={testId}
      {...resto}
      className={cn(
        'relative overflow-hidden rounded-xl border p-4',
        destacado ? 'border-fono/30 bg-gradient-to-br from-fono-dark via-fono to-fono' : 'border-ink-600 bg-ink-800',
        className,
      )}
    >
      <div className={cn('text-xs font-medium uppercase tracking-wider', destacado ? 'text-onbrand/75' : 'text-mute')}>{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums v2-numero md:text-3xl', destacado ? 'text-onbrand' : 'text-fore', valorClassName)}>
        {valor}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {typeof delta === 'number' && (
          <span className={cn('font-medium', sube ? 'text-ok' : 'text-bad')}>
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className={destacado ? 'text-onbrand/75' : 'text-mute'}>{sub}</span>}
      </div>
    </div>
  )
}
