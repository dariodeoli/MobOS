// Personalizar la planilla de Unidades (#466): cómo se ven proveedor, sucursal/depósito,
// IMEI y estado, y qué columnas van y en qué orden. Se guarda por usuario (en su
// navegador) y el dueño o gerente puede dejarlo como default de la empresa.
// El costo se muestra solo a quien el servidor se lo da (Configuración › Permisos):
// acá únicamente se elige si se ve en la planilla.
import PoliticaVerificacion from './PoliticaVerificacion'
import { useState } from 'react'
import { useToast } from '@/components/ui'
import { Modal } from '@/components/shared/popupKit'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { COLUMNAS_PLANILLA, ORDEN_COLUMNAS, OPCIONES_PLANILLA } from '@/lib/planillaPrefs'

const GRUPOS = [
  ['proveedor', 'Proveedor'],
  ['ubicacion', 'Sucursal y depósito'],
  ['imei', 'IMEI'],
  ['estado', 'Estado'],
]

function Segmentos({ clave, etiqueta, valor, onElegir }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-mute">{etiqueta}</p>
      <div role="group" aria-label={etiqueta} data-testid={`planilla-pref-${clave}`} className="flex flex-wrap gap-1.5">
        {OPCIONES_PLANILLA[clave].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            aria-pressed={valor === id}
            data-testid={`planilla-pref-${clave}-${id}`}
            onClick={() => onElegir(id)}
            className={cn(
              'min-h-11 rounded-full border px-3 text-xs font-semibold transition lg:min-h-9',
              valor === id ? 'border-fono bg-fono text-onbrand' : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore',
            )}
          >
            {texto}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PersonalizarPlanilla({ abierto, onCerrar, planilla, propia, rolVeCosto, guardarPropia, guardarEmpresa }) {
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)
  const elegidas = planilla.columnas
  const orden = [...elegidas, ...ORDEN_COLUMNAS.filter((id) => !elegidas.includes(id))].filter((id) => id !== 'costo' || rolVeCosto)
  const cambiarColumnas = (lista) => guardarPropia({ columnas: lista })
  const alternar = (id) => cambiarColumnas(elegidas.includes(id) ? elegidas.filter((c) => c !== id) : [...orden.filter((c) => c === id || elegidas.includes(c))])
  const mover = (id, paso) => {
    const visibles = orden.filter((c) => elegidas.includes(c))
    const indice = visibles.indexOf(id)
    const destino = indice + paso
    if (indice < 0 || destino < 0 || destino >= visibles.length) return
    const copia = [...visibles]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    cambiarColumnas(copia)
  }
  const hayPropias = Object.keys(propia || {}).length > 0
  const comoEmpresa = () => guardarPropia(Object.fromEntries([...GRUPOS.map(([clave]) => [clave, undefined]), ['columnas', undefined], ['costo', undefined]]))
  async function dejarComoDefault() {
    setGuardando(true)
    try {
      await guardarEmpresa({ proveedor: planilla.proveedor, ubicacion: planilla.ubicacion, imei: planilla.imei, estado: planilla.estado, columnas: planilla.columnas, costo: planilla.costo })
      comoEmpresa()
      toast.success('Listo: la planilla de toda la empresa queda así.')
    } catch (causa) {
      console.error('[stock] no se pudo guardar el default de la planilla', causa)
      toast.error(causa?.message || 'No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Modal open={abierto} onClose={onCerrar} title="Personalizar planilla" size="corto">
      <div data-testid="planilla-personalizar" className="space-y-4">
        <p className="text-xs text-mute">Se guarda para vos. El dueño o gerente puede dejarlo como el de toda la empresa.</p>
        {GRUPOS.map(([clave, etiqueta]) => (
          <Segmentos key={clave} clave={clave} etiqueta={etiqueta} valor={planilla[clave]} onElegir={(id) => guardarPropia({ [clave]: id })} />
        ))}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-mute">Columnas (tildadas se ven, las flechas cambian el orden)</p>
          <ul data-testid="planilla-pref-columnas" className="space-y-1">
            {orden.map((id) => {
              const activa = elegidas.includes(id)
              const visibles = orden.filter((c) => elegidas.includes(c))
              const indice = visibles.indexOf(id)
              return (
                <li key={id} className="flex min-h-11 items-center gap-2 rounded-lg border border-ink-600 px-2 lg:min-h-9">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" checked={activa} data-testid={`planilla-col-${id}`} onChange={() => alternar(id)} />
                    <span className="truncate">{COLUMNAS_PLANILLA[id].etiqueta}</span>
                  </label>
                  <button type="button" aria-label={`Subir ${COLUMNAS_PLANILLA[id].etiqueta}`} disabled={!activa || indice <= 0} onClick={() => mover(id, -1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-mute hover:text-fore disabled:opacity-30">
                    <Icon name="chevron" className="h-4 w-4 rotate-180" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Bajar ${COLUMNAS_PLANILLA[id].etiqueta}`} disabled={!activa || indice < 0 || indice >= visibles.length - 1} onClick={() => mover(id, 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-mute hover:text-fore disabled:opacity-30">
                    <Icon name="chevron" className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
          {rolVeCosto ? <p className="text-[11px] text-mute">El costo lo ven solo quienes tienen el permiso en Configuración › Permisos; acá no se cambia eso.</p> : null}
        </div>
        <PoliticaVerificacion />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" disabled={!hayPropias} data-testid="planilla-pref-empresa" onClick={comoEmpresa} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fono-light hover:underline disabled:opacity-40 lg:min-h-9">
            Volver al de la empresa
          </button>
          {rolVeCosto ? (
            <button type="button" disabled={guardando} data-testid="planilla-pref-default" onClick={dejarComoDefault} className="min-h-11 rounded-lg border border-ink-500 px-3 text-xs font-semibold hover:border-fono/40 lg:min-h-9">
              Usar para toda la empresa
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
