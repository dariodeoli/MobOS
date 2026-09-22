import { useMemo } from 'react'
import { BarraProgreso, Input } from '@/components/ui'
import SegmentedField from '@/components/shared/SegmentedField'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { ESTADOS_ITEM, SECCIONES_INSPECCION, resumenChecklist, valorInicialChecklist } from '@/lib/inspeccionChecklist'

export { ESTADOS_ITEM, SECCIONES_INSPECCION, resumenChecklist, valorInicialChecklist } from '@/lib/inspeccionChecklist'

// Checklist de inspección por unidad (#240, inspiración PhoneCheck): secciones
// con semáforo por ítem (pasa / falla / n-a), batería (salud y ciclos),
// progreso y puntaje con grado provisional. Es UI pura: el valor entra y sale
// por props (`valor` / `onChange`), así la persistencia la define INV (#240).

const COLOR_ITEM = { pasa: 'border-ok/40 bg-ok/10', falla: 'border-bad/40 bg-bad/10', na: 'border-ink-500 bg-ink-700/40' }

export default function ChecklistInspeccion({ valor, onChange, soloLectura = false, className }) {
  const actual = valor || valorInicialChecklist()
  const resumen = useMemo(() => resumenChecklist(actual), [actual])

  const setItem = (id, estado) => onChange?.({ ...actual, items: { ...actual.items, [id]: actual.items?.[id] === estado ? '' : estado } })
  const setNota = (id, texto) => onChange?.({ ...actual, notas: { ...actual.notas, [id]: texto } })
  const setDato = (clave, texto) => onChange?.({ ...actual, [clave]: texto })

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progreso y puntaje */}
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            <b className="v2-numero text-2xl">{resumen.pasan}</b> de {resumen.total} pasan
            <span className="ml-2 text-xs font-normal text-mute">{resumen.revisados} revisados</span>
          </p>
          <p className="text-xs text-mute">
            {resumen.pasan} pasan · {resumen.fallan} fallan · puntaje <b className="text-fore">{resumen.porcentaje}%</b>
            {resumen.grado ? <> · grado <b className={resumen.grado === 'A' ? 'text-ok' : resumen.grado === 'B' ? 'text-warn' : 'text-bad'}>{resumen.grado}</b></> : null}
          </p>
        </div>
        <BarraProgreso valor={resumen.progreso} tono={resumen.fallan > 0 ? 'warn' : 'ok'} etiqueta="Progreso de la inspección" className="mt-2" />
      </div>

      {/* Secciones con semáforo por ítem */}
      {SECCIONES_INSPECCION.map((seccion) => {
        const conFalla = seccion.items.some(([id]) => actual.items?.[id] === 'falla')
        return (
          <section key={seccion.id} className="rounded-xl border border-ink-600 p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className={ROTULO_SECCION}>{seccion.titulo}</h4>
              {conFalla ? <span className="rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-[10px] font-bold uppercase text-bad">Con fallas</span> : null}
            </div>
            <div className="mt-2 space-y-2">
              {seccion.items.map(([id, etiqueta]) => {
                const estado = actual.items?.[id] || ''
                return (
                  <div key={id} className={cn('rounded-lg border px-2.5 py-2', COLOR_ITEM[estado] || 'border-ink-600')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">{etiqueta}</span>
                      {soloLectura ? (
                        <span className={cn('rounded-lg border px-2 py-0.5 text-xs font-semibold', estado === 'pasa' ? 'border-ok/40 text-ok' : estado === 'falla' ? 'border-bad/40 text-bad' : 'border-ink-500 text-mute')}>
                          {estado === 'pasa' ? 'Pasa' : estado === 'falla' ? 'Falla' : estado === 'na' ? 'N/A' : 'Sin revisar'}
                        </span>
                      ) : (
                        <SegmentedField
                          value={estado}
                          onChange={(siguiente) => setItem(id, siguiente)}
                          options={ESTADOS_ITEM.map((opcion) => [opcion.id, opcion.etiqueta, opcion.icono])}
                          ariaLabel={`${etiqueta}: resultado`}
                        />
                      )}
                    </div>
                    {estado === 'falla' && !soloLectura && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        value={actual.notas?.[id] || ''}
                        onChange={(event) => setNota(id, event.target.value)}
                        placeholder="¿Qué encontraste? (opcional)"
                        aria-label={`Nota de ${etiqueta}`}
                      />
                    )}
                    {estado === 'falla' && soloLectura && actual.notas?.[id] ? <p className="mt-1 text-xs text-mute">{actual.notas[id]}</p> : null}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Batería */}
      <section className="rounded-xl border border-ink-600 p-3">
        <h4 className={ROTULO_SECCION}>Batería</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-mute">
            Salud (%)
            <Input className="mt-1" inputMode="numeric" maxLength={3} disabled={soloLectura} value={actual.bateriaSalud} onChange={(event) => setDato('bateriaSalud', event.target.value.replace(/\D/g, ''))} placeholder="Ej. 89" aria-label="Salud de la batería" />
          </label>
          <label className="text-xs text-mute">
            Ciclos
            <Input className="mt-1" inputMode="numeric" maxLength={5} disabled={soloLectura} value={actual.bateriaCiclos} onChange={(event) => setDato('bateriaCiclos', event.target.value.replace(/\D/g, ''))} placeholder="Ej. 312" aria-label="Ciclos de la batería" />
          </label>
        </div>
      </section>
    </div>
  )
}
