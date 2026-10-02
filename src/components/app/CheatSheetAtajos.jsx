import Icon from '@/components/shared/Icon'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Cheat-sheet visual de atajos (Ayuda). Única fuente de la lista: acá viven
// las teclas y las aclaraciones (Mac, campos de texto). Lo usan el diálogo «?»
// del shell y, cuando sume, la Ayuda. Regla: no copiar la lista en otra
// pantalla; los controles de la barra no son teclas y se muestran como
// controles (#321).

export const ATAJOS_AYUDA = [
  {
    titulo: 'Buscar y moverte',
    icono: 'search',
    filas: [{ teclas: ['Ctrl', 'K'], accion: 'Búsqueda global' }],
  },
  {
    titulo: 'Vender',
    icono: 'receipt',
    filas: [
      { teclas: ['F1'], accion: 'Nueva venta' },
      { teclas: ['F2'], accion: 'Buscar producto' },
      { teclas: ['F3'], accion: 'Crear cliente' },
      { teclas: ['F4'], accion: 'Cotizar equipo (Trade-In)' },
      { teclas: ['Ctrl', 'S'], accion: 'Guardar venta', contexto: 'en el POS' },
      { teclas: ['Esc'], accion: 'Cerrar diálogos' },
    ],
  },
]

// Controles de la barra: no son teclas, se usan con un clic y se muestran con
// su ícono y su nombre (nunca «Candado»/«Chip» dentro de un `<kbd>`).
export const CONTROLES_AYUDA = [
  { icono: 'lock', accion: 'Bloquear pantalla', contexto: 'candado en la barra superior' },
  { icono: 'user', accion: 'Mi perfil', contexto: 'tu foto y nombre, en la barra' },
]

// En Mac el modificador principal es ⌘ y las teclas de función van con Fn:
// el cheat-sheet se dibuja con la tecla real del equipo que lo está viendo.
const usaMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)

export function TeclaAtajo({ children, className }) {
  return (
    <kbd className={cn('shrink-0 rounded-md border border-ink-500 bg-ink-700 px-2 py-0.5 text-xs font-semibold text-mute', className)}>
      {children}
    </kbd>
  )
}

export default function CheatSheetAtajos({ className }) {
  const mac = usaMac()
  return (
    <div className={cn('space-y-4', className)}>
      {ATAJOS_AYUDA.map(({ titulo, icono, filas }) => (
        <section key={titulo} aria-label={titulo} className="space-y-1.5">
          <p className={cn(ROTULO_SECCION, 'flex items-center gap-1.5')}>
            <Icon name={icono} className="h-3.5 w-3.5" aria-hidden="true" />
            {titulo}
          </p>
          <div className="divide-y divide-fore/10 rounded-xl border border-fore/10 bg-fore/[.02]">
            {filas.map(({ teclas, accion, contexto }) => (
              <div key={accion} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-sm text-fore">
                  {accion}
                  {contexto && <span className="text-xs font-normal text-mute"> · {contexto}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {teclas.map((tecla, indice) => (
                    <TeclaAtajo key={`${tecla}-${indice}`}>{tecla === 'Ctrl' && mac ? '⌘' : tecla}</TeclaAtajo>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section aria-label="Controles de la barra" className="space-y-1.5">
        <p className={cn(ROTULO_SECCION, 'flex items-center gap-1.5')}>
          <Icon name="lock" className="h-3.5 w-3.5" aria-hidden="true" />
          Controles de la barra
        </p>
        <div className="divide-y divide-fore/10 rounded-xl border border-fore/10 bg-fore/[.02]">
          {CONTROLES_AYUDA.map(({ icono, accion, contexto }) => (
            <div key={accion} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 text-sm text-fore">
                {accion}
                <span className="text-xs font-normal text-mute"> · {contexto}</span>
              </span>
              <Icon name={icono} className="h-4 w-4 shrink-0 text-mute" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-1 text-xs text-mute">
        <p>Los atajos no funcionan mientras escribís en un campo o hay un diálogo abierto.</p>
        <p>En Mac, F1…F4 van con Fn (Fn+F1…) y ⌘ reemplaza a Ctrl.</p>
      </div>
    </div>
  )
}
