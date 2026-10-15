import { Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { formatGs, formatUsd } from '@/utils/moneda'

// Llegada de mercadería (#408 G): resumen del lote. En el borrador es la barra
// fija de abajo con «Confirmar llegada» (bloqueada mientras haya errores); ya
// confirmada es la ficha del resultado. Un solo componente para no contar dos veces.

const CONTADORES = [
  ['ingresaron', 'ingresan', 'ingresaron'],
  ['preVendidos', 'pre-vendidos', 'pre-vendidos'],
  ['aOtraSucursal', 'a otra sucursal', 'a otra sucursal'],
  ['devueltos', 'devueltos', 'devueltos'],
  ['noLlegaron', 'no llegaron', 'no llegaron'],
  ['faltaImei', 'faltan IMEI', 'faltan IMEI'],
  ['tecnico', 'a técnico', 'a técnico'],
]

export function textoCosto(resumen) {
  if (!resumen) return ''
  const partes = []
  if (resumen.costUsd != null && resumen.currency === 'USD') partes.push(formatUsd(resumen.costUsd))
  if (resumen.costPyg != null) partes.push(formatGs(resumen.costPyg))
  return partes.join(' · ')
}

function Contadores({ resumen, confirmada }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label="Resumen de la llegada" data-testid="llegada-contadores">
      {CONTADORES.map(([clave, borrador, final]) => {
        const valor = resumen?.[clave] || 0
        if (!valor && clave !== 'ingresaron') return null
        return (
          <li key={clave} className={valor ? '' : 'text-mute'} data-testid={`llegada-resumen-${clave}`}>
            <b className="tabular-nums">{valor}</b> {confirmada ? final : borrador}
          </li>
        )
      })}
    </ul>
  )
}

export default function ResumenLlegada({ resumen, confirmable, onConfirmar, ocupado, confirmada = false, acciones = null }) {
  const errores = resumen?.errores || 0
  const costo = textoCosto(resumen)
  if (confirmada) {
    return (
      <div className="space-y-3" data-testid="llegada-resumen-final">
        <div className="flex items-center gap-2 font-semibold text-ok"><Icon name="check" className="h-4 w-4" />Llegada confirmada</div>
        <Contadores resumen={resumen} confirmada />
        {costo && <p className="text-sm text-mute">Costo total <b className="text-fore tabular-nums">{costo}</b></p>}
        {acciones}
      </div>
    )
  }
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-ink-600 bg-ink px-4 py-2.5 shadow-card md:mx-0 md:rounded-xl md:border" data-testid="llegada-resumen">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <Contadores resumen={resumen} />
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-mute">
            {costo && <span>Costo total <b className="text-fore tabular-nums" data-testid="llegada-costo">{costo}</b></span>}
            {errores > 0
              ? <span className="font-semibold text-bad" data-testid="llegada-errores">{errores} error{errores === 1 ? '' : 'es'} por corregir</span>
              : <span className="text-ok" data-testid="llegada-errores">Sin errores</span>}
            {(resumen?.avisos || 0) > 0 && <span className="text-warn">{resumen.avisos} aviso{resumen.avisos === 1 ? '' : 's'}</span>}
          </p>
        </div>
        <Button type="button" onClick={onConfirmar} disabled={!confirmable || ocupado} className="min-h-11 w-full sm:w-auto" data-testid="llegada-confirmar">
          <Icon name="check" className="h-4 w-4" />{ocupado ? 'Confirmando…' : 'Confirmar llegada'}
        </Button>
      </div>
    </div>
  )
}
