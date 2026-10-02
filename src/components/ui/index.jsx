import { Input, TAMANOS_CAMPO } from 'owncoding-ui'
// Los helpers de dinero salen del módulo del repo, no de la biblioteca: desde
// la migración bigint de §9 (#278) los topes reales son 10B general / 99B
// ventas y la biblioteca todavía acota al techo de 32 bits.
import {
  LIMITE_MONTO_GENERAL,
  excedeMonto,
  formatGsInput,
  formatUsdInput,
  largoMaximoMonto,
  limiteMonto,
  parseGsInput,
  parseUsdInput,
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

export function MoneyInput({ currency = 'PYG', symbol, value, onValueChange, className, max = LIMITE_MONTO_GENERAL, maxLength, ...props }) {
  const isPyg = currency === 'PYG'
  const prefix = symbol || MONEY_SYMBOL[currency] || currency
  const display = isPyg ? formatGsInput(value) : formatUsdInput(value)
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
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, '')
          onValueChange?.(isPyg ? (next.trim() ? parseGsInput(next) : '') : parseUsdInput(next))
        }}
        className={cn(TAMANOS_CAMPO.moneda, prefijoLargo ? 'pl-11' : 'pl-8', 'tabular-nums', className)}
      />
    </div>
  )
}

// ── Stat (local: delta sin flechas, pendiente con DSN) ──────────────
export function Stat({ label, valor, delta, sub, destacado = false, className }) {
  const sube = typeof delta === 'number' && delta >= 0
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4',
        destacado ? 'border-fono/30 bg-gradient-to-br from-fono-dark via-fono to-fono' : 'border-ink-600 bg-ink-800',
        className,
      )}
    >
      <div className={cn('text-[11px] font-medium uppercase tracking-wider', destacado ? 'text-onbrand/75' : 'text-mute')}>{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums md:text-3xl v2-numero', destacado ? 'text-onbrand' : 'text-fore')}>
        {valor}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {typeof delta === 'number' && (
          <span className={cn('font-medium', sube ? 'text-ok' : 'text-bad')}>
            {sube ? '' : ''} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className={destacado ? 'text-onbrand/75' : 'text-mute'}>{sub}</span>}
      </div>
    </div>
  )
}
