import { useState } from 'react'
import { fechaClave, gs } from '@/utils/calculos'
import { aplicarSeguro, gananciaDelDia, lineasDeGanancia } from '@/utils/ganancias'
import { Card } from '@/components/ui'

// Calendario mensual de resultados: cada día coloreado por ganancia/pérdida y
// detalle del día elegido. Vivía dentro de Ganancias; desde #181 es compartido
// (Ganancias y Reportes) y los cálculos salen de `utils/ganancias`. `seguroPct`
// permite a la demo (#194) mostrar el costo real con seguro en cada día.

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

const ESTILO_DIA = {
  ganancia: 'bg-ok/15 text-ok border-ok/30',
  perdida: 'bg-bad/15 text-bad border-bad/30',
  empate: 'bg-warn/15 text-warn border-warn/30',
  vacio: 'bg-ink-800 text-mute border-ink-600',
}

export default function CalendarioGanancias({ datos, serieApi, titulo, nota, seguroPct = 0 }) {
  const hoy = new Date()
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [sel, setSel] = useState(null)

  const anio = cursor.getFullYear()
  const mes = cursor.getMonth()
  const claveHoy = fechaClave()

  // Día de semana del 1° (0 = lunes) y cantidad de días del mes.
  const offset = (new Date(anio, mes, 1).getDay() + 6) % 7
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()

  const celdas = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) {
    const clave = fechaClave(new Date(anio, mes, d))
    celdas.push({ d, clave, ...aplicarSeguro(gananciaDelDia(clave, datos, serieApi), seguroPct) })
  }

  const irMes = (delta) => {
    setSel(null)
    setCursor(new Date(anio, mes + delta, 1))
  }

  const detalle = sel ? aplicarSeguro(gananciaDelDia(sel, datos, serieApi), seguroPct) : null

  return (
    <Card>
      {(titulo || nota) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h3 className="font-semibold">{titulo}</h3>}
          {nota && <span className="text-xs text-mute">{nota}</span>}
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Calendario compacto */}
        <div className="w-full max-w-[300px] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => irMes(-1)}
              className="h-7 w-7 rounded-lg text-mute hover:bg-ink-700 font-bold"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-fore">
              {MESES[mes]} {anio}
            </span>
            <button
              onClick={() => irMes(1)}
              className="h-7 w-7 rounded-lg text-mute hover:bg-ink-700 font-bold"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-0.5">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-mute">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {celdas.map((c, i) =>
              c == null ? (
                <div key={`v${i}`} />
              ) : (
                <button
                  key={c.clave}
                  onClick={() => setSel(sel === c.clave ? null : c.clave)}
                  className={
                    'h-9 rounded-md border text-xs font-bold flex items-center justify-center transition ' +
                    ESTILO_DIA[c.estado] +
                    (c.clave === claveHoy ? ' ring-2 ring-fono' : '') +
                    (c.clave === sel ? ' ring-2 ring-fono' : '')
                  }
                >
                  {c.d}
                </button>
              ),
            )}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-mute">
            <Leyenda color="bg-ok" label="Ganancia" />
            <Leyenda color="bg-bad" label="Pérdida" />
            <Leyenda color="bg-warn" label="Empate" />
            <Leyenda color="bg-ink-600" label="Sin ventas" />
          </div>
        </div>

        {/* Historial del día seleccionado */}
        <div className="flex-1 lg:border-l lg:border-ink-600 lg:pl-4">
          {detalle ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-fore">
                  {detalle.estado === 'ganancia'
                    ? 'Ganancia'
                    : detalle.estado === 'perdida'
                      ? 'Pérdida'
                      : detalle.estado === 'empate'
                        ? 'Empate'
                        : 'Sin movimiento'}{' '}
                  · {sel}
                </span>
                <span
                  className={
                    'font-extrabold ' +
                    (detalle.estado === 'ganancia'
                      ? 'text-ok'
                      : detalle.estado === 'perdida'
                        ? 'text-bad'
                        : 'text-fore')
                  }
                >
                  {gs(detalle.ganancia)}
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                {lineasDeGanancia(detalle, { costo: 'Costo de mercadería' }).map((linea) => (
                  <LineaValor key={linea.label} {...linea} />
                ))}
              </div>
              <div className="text-xs text-mute mt-2">{detalle.cantVentas} ventas en el día</div>
            </div>
          ) : (
            <div className="text-sm text-mute py-2">
              Tocá un día para ver su historial de ganancia.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export function Leyenda({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={'h-3 w-3 rounded ' + color} />
      {label}
    </span>
  )
}

export function LineaValor({ label, valor, signo, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mute">{label}</span>
      <span className={'font-bold ' + color}>
        {signo} {gs(valor)}
      </span>
    </div>
  )
}
