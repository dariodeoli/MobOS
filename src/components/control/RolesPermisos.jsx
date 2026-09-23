import { Badge, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import {
  CAPACIDADES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  capacidadesDe,
  capacidadesNegadas,
  capacidadesPorDominio,
} from '@/lib/roles'

// Tiles de rol con el acceso por dominio (vista previa v2, #241): un vistazo
// de qué puede tocar cada rol, con el "x de y" de capacidades y los dominios
// habilitados como chips. Solo lectura de los datos existentes; se apaga con
// el flag.
function TilesRoles() {
  const grupos = capacidadesPorDominio()
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ROLE_ORDER.map(rol => {
        const permitidas = capacidadesDe(rol)
        return (
          <div key={rol} className="v2-tile rounded-2xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b className="block truncate text-sm">{ROLE_LABELS[rol]}</b>
                <p className="mt-0.5 text-[11px] leading-4 text-mute">{ROLE_DESCRIPTIONS[rol]}</p>
              </div>
              <span className="v2-numero shrink-0 text-2xl font-bold">
                {permitidas.length}<span className="text-sm font-semibold text-mute">/{CAPACIDADES.length}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {grupos.map(grupo => {
                const tiene = grupo.capacidades.some(capacidad => capacidad.roles.includes(rol))
                return <Badge key={grupo.dominio} color={tiene ? 'green' : 'slate'}>{grupo.dominio}</Badge>
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListaCapacidades({ capacidades, vacio }) {
  if (!capacidades.length) return <p className="text-xs text-mute">{vacio}</p>
  return (
    <ul className="space-y-1.5">
      {capacidades.map(capacidad => (
        <li
          key={capacidad.id}
          className="rounded-lg border border-ink-600/60 bg-ink-800/60 px-2.5 py-2"
        >
          <b className="block text-xs font-semibold">{capacidad.label}</b>
          <span className="mt-0.5 block text-[11px] leading-4 text-mute">
            {capacidad.description}
          </span>
        </li>
      ))}
    </ul>
  )
}

function FichaRol({ rol }) {
  const permitidas = capacidadesDe(rol)
  const negadas = capacidadesNegadas(rol)
  return (
    <details className="group rounded-2xl border border-ink-600 bg-ink-800/40">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
        <span className="shrink-0 text-sm font-bold">{ROLE_LABELS[rol]}</span>
        <span className="min-w-0 flex-1 text-xs text-mute">{ROLE_DESCRIPTIONS[rol]}</span>
        <Badge color={negadas.length ? 'blue' : 'green'}>
          {negadas.length ? `${permitidas.length} de ${CAPACIDADES.length}` : 'Todos los permisos'}
        </Badge>
        <Icon name="chevron" className="h-4 w-4 shrink-0 text-mute transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t border-ink-600 p-3 sm:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-mute">
            Qué puede hacer
          </h4>
          <div className="mt-2">
            <ListaCapacidades capacidades={permitidas} vacio="No tiene permisos habilitados." />
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-mute">Qué no puede</h4>
          <div className="mt-2">
            <ListaCapacidades
              capacidades={negadas}
              vacio="Nada: tiene todos los permisos del panel."
            />
          </div>
        </div>
      </div>
    </details>
  )
}

function Matriz() {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-600">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-ink-700">
            <th
              scope="col"
              className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-mute"
            >
              Capacidad
            </th>
            {ROLE_ORDER.map(rol => (
              <th key={rol} scope="col" className="px-3 py-2 text-center text-xs font-bold">
                {ROLE_LABELS[rol]}
              </th>
            ))}
          </tr>
        </thead>
        {capacidadesPorDominio().map(grupo => (
          <tbody key={grupo.dominio}>
            <tr>
              <th
                colSpan={ROLE_ORDER.length + 1}
                scope="colgroup"
                className="border-y border-ink-600 bg-ink-800/70 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-mute"
              >
                {grupo.dominio}
              </th>
            </tr>
            {grupo.capacidades.map(capacidad => (
              <tr key={capacidad.id} className="border-b border-ink-600/50 last:border-0">
                <th scope="row" className="px-3 py-2 text-left align-top">
                  <b className="block text-[13px] font-semibold">{capacidad.label}</b>
                  <span className="mt-0.5 block text-[11px] font-normal leading-4 text-mute">
                    {capacidad.description}
                  </span>
                </th>
                {ROLE_ORDER.map(rol => {
                  const tiene = capacidad.roles.includes(rol)
                  return (
                    <td key={rol} className="px-3 py-2 text-center align-middle">
                      <span
                        className={cn(
                          'inline-grid h-6 w-6 place-items-center rounded-lg text-sm font-extrabold',
                          tiene ? 'bg-ok/15 text-ok' : 'bg-ink-700 text-mute',
                        )}
                        aria-label={tiene ? `${ROLE_LABELS[rol]}: permitido` : `${ROLE_LABELS[rol]}: no permitido`}
                      >
                        {tiene ? '✓' : '×'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

export default function RolesPermisos() {
  // Vista previa v2 (#241): los roles se resumen en tiles con su acceso por
  // dominio; la ficha y la matriz siguen igual. Sin el flag, nada cambia.
  const v2 = temaV2Activo()
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-mute">
          Qué puede hacer y ver cada rol del equipo. El Dueño conserva todos los permisos y los
          cambios de rol quedan auditados.
        </p>
        {v2 && <div className="mt-4"><TilesRoles /></div>}
        <div className="mt-4 space-y-2">
          {ROLE_ORDER.map(rol => (
            <FichaRol key={rol} rol={rol} />
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="font-bold">Matriz de capacidades</h3>
        <p className="mt-1 text-sm text-mute">
          Comparación por rol de todas las capacidades del panel.
        </p>
        <div className="mt-4">
          <Matriz />
        </div>
      </Card>
    </div>
  )
}
