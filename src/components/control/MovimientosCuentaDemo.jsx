import { useMemo, useState } from 'react'
import Popup from '@/components/shared/Popup'
import ChipsFiltro from '@/components/ventas/ChipsFiltro'
import { Stat } from '@/components/ui'
import { librosDemo } from '@/lib/demoHistoria'
import { PERIODOS, enPeriodo } from '@/lib/demo/historiaCuentas'
import { formatGs } from '@/utils/moneda'
import { fechaHora } from '@/utils/fecha'

// Movimientos de una cuenta de la demo (caja, bancos, tarjetas, billeteras):
// día por día de los últimos ~4 meses, con saldo corrido y filtros de período
// (Hoy, Ayer, 7 días, Mes, Mes anterior). Sale de los pedidos, gastos y compras
// de la propia demo; no llama al API. Solo se abre en modo demo.
export default function MovimientosCuentaDemo({ cuenta, onClose }) {
  const [periodo, setPeriodo] = useState('hoy')
  const libro = useMemo(() => librosDemo().cuentas.find((fila) => fila.id === cuenta?.id) || null, [cuenta?.id])
  const filas = useMemo(() => (libro ? libro.movimientos.filter((m) => enPeriodo(m, periodo)) : []), [libro, periodo])
  const ingresos = filas.reduce((suma, m) => suma + m.ingresoPyg, 0)
  const egresos = filas.reduce((suma, m) => suma + m.egresoPyg, 0)
  return (
    <Popup open onClose={onClose} tipo="detalle" tamano="xl" title={`Movimientos · ${cuenta?.name || ''}`} acciones={{ secundaria: { label: 'Cerrar', onClick: onClose } }}>
      <div className="space-y-3" data-testid="cuenta-movimientos">
        {!libro && <p className="text-sm text-mute">Esta cuenta todavía no tiene movimientos.</p>}
        {libro && (
          <>
            <ChipsFiltro etiqueta="Período de los movimientos" opciones={PERIODOS.map((p) => [p.id, p.label])} valor={periodo} onChange={setPeriodo} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat compact label="Saldo actual" valor={formatGs(libro.saldoPyg)} />
              <Stat compact label="Ingresos del período" valor={formatGs(ingresos)} valorClassName="text-ok" />
              <Stat compact label="Egresos del período" valor={formatGs(egresos)} valorClassName="text-bad" />
              <Stat compact label="Movimientos" valor={String(filas.length)} />
            </div>
            <p className="text-[11px] text-mute">Equivalente en guaraníes. Cada fila sale de un pedido, un gasto, una compra o una transferencia entre cuentas; el saldo es la suma corrida desde el saldo inicial de {formatGs(libro.aperturaPyg)}.</p>
            {filas.length === 0 && <p className="text-sm text-mute" data-testid="cuenta-mov-vacio">Sin movimientos en este período.</p>}
            <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600" data-testid="cuenta-mov-lista">
              {filas.slice(0, 200).map((m) => (
                <li key={m.id} data-testid="cuenta-mov-fila" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate font-semibold text-fore" title={m.concepto}>{m.concepto}</span>
                  <span className={`text-right tabular-nums font-semibold ${m.ingresoPyg ? 'text-ok' : m.egresoPyg ? 'text-bad' : 'text-mute'}`}>
                    {m.ingresoPyg ? `+${formatGs(m.ingresoPyg)}` : m.egresoPyg ? `−${formatGs(m.egresoPyg)}` : '—'}
                  </span>
                  <span className="min-w-0 truncate text-mute" title={m.detalle}>{fechaHora(m.at)}{m.detalle ? ` · ${m.detalle}` : ''}</span>
                  <span className="text-right tabular-nums text-mute">Saldo {formatGs(m.saldoPyg)}</span>
                </li>
              ))}
            </ul>
            {filas.length > 200 && <p className="text-[11px] text-mute">Se muestran los 200 movimientos más recientes del período.</p>}
          </>
        )}
      </div>
    </Popup>
  )
}
