import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { celdasDeCodigo, estadoCodigo, insertarEnCodigo, largoCodigo, limpiarCodigo } from '@/lib/codigoSegmentado'

// Código de formato fijo en celdas (#372): vinculación de puente (ABCDE-FGHIJ),
// gift card (GC-XXXX-XXXX-XXXX), IMEI. Una celda por carácter, avance
// automático, borrar retrocede, flechas navegan y pegar el código completo
// (con o sin guiones/prefijo) llena todas las celdas. El valor que maneja el
// padre es solo el cuerpo (sin guiones ni prefijo).
export default function CodigoSegmentado({
  value = '',
  onChange,
  onComplete,
  grupos = [5, 5],
  alfabeto = 'alfanumerico',
  prefijo = '',
  validar,
  ariaLabel = 'Código',
  id,
  autoFocus = false,
  disabled = false,
  mensajeError = 'El código no es válido.',
  mensajeIncompleto,
  className,
}) {
  const total = largoCodigo(grupos)
  const celdas = celdasDeCodigo(value, grupos)
  const refs = useRef([])
  const estado = estadoCodigo(value, grupos, validar)
  const invalido = estado === 'invalido'
  const numerico = alfabeto === 'numerico'
  const idMensaje = id ? `${id}-estado` : undefined

  function emitir(next) {
    onChange?.(next)
    if (next.length === total && next !== value) onComplete?.(next)
  }
  function enfocar(i) {
    const el = refs.current[Math.max(0, Math.min(total - 1, i))]
    el?.focus(); el?.select?.()
  }
  function escribir(i, texto) {
    const limpio = limpiarCodigo(texto, alfabeto, prefijo)
    if (!limpio) return
    const desde = Math.min(i, value.length)
    const next = (value.slice(0, desde) + limpio + value.slice(desde + limpio.length)).slice(0, total)
    emitir(next)
    enfocar(Math.min(next.length, total - 1))
  }
  function onKeyDown(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (celdas[i]) emitir(value.slice(0, i) + value.slice(i + 1))
      else if (i > 0) { emitir(value.slice(0, i - 1) + value.slice(i)); enfocar(i - 1) }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); enfocar(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); enfocar(i + 1) }
    else if (e.key === 'Home') { e.preventDefault(); enfocar(0) }
    else if (e.key === 'End') { e.preventDefault(); enfocar(total - 1) }
  }
  function onPaste(i, e) {
    const pegado = limpiarCodigo(e.clipboardData.getData('text'), alfabeto, prefijo)
    if (!pegado) return
    e.preventDefault()
    const desde = Math.min(i, value.length)
    const next = insertarEnCodigo(value, desde, pegado, total)
    emitir(next)
    enfocar(Math.min(next.length, total - 1))
  }

  let indice = 0
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        role="group"
        aria-label={ariaLabel}
        aria-describedby={idMensaje}
        data-invalido={invalido ? 'true' : undefined}
        className="codigo-seg flex flex-wrap items-center gap-x-1.5 gap-y-2"
      >
        {prefijo && <span aria-hidden="true" className="select-none pr-0.5 font-mono text-sm font-bold text-mute">{prefijo}</span>}
        {grupos.map((n, g) => (
          <span key={g} className="flex items-center gap-1">
            {g > 0 && <span aria-hidden="true" className="mr-0.5 text-mute">–</span>}
            {Array.from({ length: n }, () => {
              const i = indice; indice += 1
              return (
                <input
                  key={i}
                  ref={(el) => { refs.current[i] = el }}
                  id={i === 0 ? id : undefined}
                  type="text"
                  inputMode={numerico ? 'numeric' : 'text'}
                  pattern={numerico ? '[0-9]*' : undefined}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus={autoFocus && i === 0}
                  disabled={disabled}
                  value={celdas[i]}
                  aria-label={`${ariaLabel}, carácter ${i + 1} de ${total}`}
                  aria-invalid={invalido || undefined}
                  data-testid={`codigo-celda-${i}`}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => escribir(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={(e) => onPaste(i, e)}
                  className={cn(
                    'codigo-seg-celda h-11 w-11 min-w-0 rounded-lg border bg-paper text-center font-mono text-base font-semibold uppercase text-fore outline-none lg:w-9',
                    invalido ? 'border-bad bg-bad/5' : celdas[i] ? 'border-fono-dark/60' : 'border-ink-500',
                    'focus:border-fono-dark focus:ring-2 focus:ring-fono-dark/30 disabled:opacity-50',
                  )}
                />
              )
            })}
          </span>
        ))}
      </div>
      <p
        id={idMensaje}
        role={invalido ? 'alert' : 'status'}
        className={cn('min-h-4 text-xs', invalido ? 'text-bad' : estado === 'completo' ? 'text-ok' : 'text-mute')}
      >
        {invalido ? mensajeError
          : estado === 'completo' ? 'Código completo.'
          : estado === 'incompleto' ? (mensajeIncompleto || `Faltan ${total - value.length} de ${total} caracteres.`)
          : ''}
      </p>
    </div>
  )
}
