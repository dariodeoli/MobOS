import { cn } from '@/lib/utils'
import PieListado from './PieListado'
import { CONSULTA_LG, CONSULTA_MD, CONSULTA_XL, useMediaQuery } from './useMediaQuery'

// Listado denso reutilizable (docs/TABLAS.md · docs/PANTALLAS.md regla 8).
// Dos modos sobre el mismo contrato (`lista` = usePaginaLista):
//  - Clásico: `renderFila` dibuja cada fila (Conciliación, Rendiciones, Stock).
//  - Responsivo: `columns` + `renderCard`. ≥ md tabla en grilla que entra en
//    1280 sin scroll horizontal; < md una tarjeta por fila (sin `min-w` ni
//    `overflow-x`). Se dibuja UNA sola versión (no hay DOM duplicado).
// Columna: { key, header, cell(fila, índice), ancho = 'minmax(0,1fr)',
//   align = 'left'|'right', className, sr = false, dinero = false }. `dinero`
//   nunca recorta la cifra (whitespace-nowrap, sin truncate); dale un piso en rem. El `ancho` es una pista de
// grilla (`rem`, `minmax(0,Nfr)`); no usar `auto`: encabezado y filas no
// compartirían pistas. Los importes van `align: 'right'` (tabular-nums).
// Sin `renderCard`, la tarjeta sale de las columnas: la primera es el título y
// el resto «etiqueta: valor».
// `obtenerClave(fila, índice)` da la key de React; `alAbrir(fila)` vuelve la
// fila un botón accionable por teclado. `atributosFila(fila, índice)` devuelve
// atributos extra para el contenedor de la fila o tarjeta (p. ej. `data-testid`);
// su `className` se suma a la de la fila de tabla (p. ej. tinte de mora).
// `desde` = 'md' (defecto) | 'lg' | 'xl': el punto desde el cual se dibuja la tabla;
// las tablas con controles dentro de la fila (inputs, selects) usan 'lg' para
// que a 768 sigan siendo tarjetas y los controles no se pisen.
export default function ListaDensa({
  lista, encabezado = null, renderFila, columns, renderCard, obtenerClave, alAbrir, atributosFila, desde = 'md', etiquetaTabla = 'Listado',
  className, claseFilas = 'space-y-1', testId, etiquetaPie, unidad,
}) {
  const esMd = useMediaQuery({ md: CONSULTA_MD, lg: CONSULTA_LG, xl: CONSULTA_XL }[desde] || CONSULTA_MD, true)
  if (!lista || !lista.total) return null
  const filas = lista.filas.map((fila, indice) => ({ fila, indice: lista.inicio + indice }))
  const clave = (fila, indice) => (obtenerClave ? obtenerClave(fila, indice) : indice)

  let cuerpo
  if (!columns) {
    cuerpo = (
      <div data-testid={testId}>
        {encabezado}
        <div className={claseFilas}>{filas.map(({ fila, indice }) => renderFila(fila, indice))}</div>
      </div>
    )
  } else if (esMd) {
    const plantilla = columns.map((c) => c.ancho || 'minmax(0,1fr)').join(' ')
    cuerpo = (
      <div data-testid={testId} role="table" aria-label={etiquetaTabla} className="min-w-0 rounded-xl border border-ink-600 bg-ink-800">
        <div role="row" style={{ gridTemplateColumns: plantilla }} className="grid items-center gap-x-2 border-b border-ink-600 px-3 py-2">
          {columns.map((c) => (
            <div key={c.key} role="columnheader" className={cn('min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-mute', c.align === 'right' && 'text-right')}>
              {c.sr ? <span className="sr-only">{c.header}</span> : c.header}
            </div>
          ))}
        </div>
        <div role="rowgroup">
          {filas.map(({ fila, indice }) => {
            const { className: claseExtra, ...extra } = (atributosFila ? atributosFila(fila, indice) : null) || {}
            return (
            <div
              key={clave(fila, indice)}
              role="row"
              data-fila
              {...extra}
              style={{ gridTemplateColumns: plantilla }}
              tabIndex={alAbrir ? 0 : undefined}
              onClick={alAbrir ? () => alAbrir(fila) : undefined}
              onKeyDown={alAbrir ? (evento) => { if (evento.target === evento.currentTarget && (evento.key === 'Enter' || evento.key === ' ')) { evento.preventDefault(); alAbrir(fila) } } : undefined}
              className={cn('grid min-h-9 items-center gap-x-2 border-b border-ink-600 px-3 py-2 text-[13px] last:border-b-0', alAbrir && 'cursor-pointer hover:bg-ink-700/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono', claseExtra)}
            >
              {columns.map((c) => (
                <div key={c.key} role="cell" className={cn('min-w-0', c.dinero ? 'whitespace-nowrap' : 'truncate', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                  {c.cell(fila, indice)}
                </div>
              ))}
            </div>
            )
          })}
        </div>
      </div>
    )
  } else {
    const [titulo, ...resto] = columns
    cuerpo = (
      <ul data-testid={testId} aria-label={etiquetaTabla} className="space-y-2">
        {filas.map(({ fila, indice }) => (
          <li key={clave(fila, indice)} data-fila {...(atributosFila ? atributosFila(fila, indice) : null)}>
            {renderCard ? renderCard(fila, indice) : (
              <div
                role={alAbrir ? 'button' : undefined}
                tabIndex={alAbrir ? 0 : undefined}
                onClick={alAbrir ? () => alAbrir(fila) : undefined}
                onKeyDown={alAbrir ? (evento) => { if (evento.target === evento.currentTarget && (evento.key === 'Enter' || evento.key === ' ')) { evento.preventDefault(); alAbrir(fila) } } : undefined}
                className="min-h-11 rounded-xl border border-ink-600 bg-ink-800 p-3"
              >
                <div className="min-w-0 break-words text-sm font-semibold text-fore">{titulo.cell(fila, indice)}</div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-[13px]">
                  {resto.filter((c) => !c.sr).map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-xs text-mute">{c.header}</dt>
                      <dd className={cn('min-w-0 break-words text-right', c.align === 'right' && 'tabular-nums')}>{c.cell(fila, indice)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {cuerpo}
      <PieListado lista={lista} etiqueta={etiquetaPie} unidad={unidad} />
    </div>
  )
}
