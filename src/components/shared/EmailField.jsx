import { useRef, useState } from 'react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

// Correo con sugerencias: mientras se escribe con teclado sugiere dominios
// frecuentes y completa el valor al elegir una. No interfiere con pegado,
// autocompletado del navegador ni con el submit del formulario.

const DOMINIOS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'hotmail.es',
  'outlook.es',
]

const MAX_SUGERENCIAS = 4

function sugerenciasDe(value) {
  const texto = String(value || '').trim()
  const arroba = texto.indexOf('@')
  const usuario = arroba === -1 ? texto : texto.slice(0, arroba)
  const dominio = arroba === -1 ? '' : texto.slice(arroba + 1).toLowerCase()
  if (!usuario) return []
  if (dominio.includes(' ')) return []
  const coincidencias = dominio
    ? DOMINIOS.filter((candidato) => candidato.startsWith(dominio) && candidato !== dominio)
    : DOMINIOS
  return coincidencias.slice(0, MAX_SUGERENCIAS).map((d) => `${usuario}@${d}`)
}

export default function EmailField({
  value = '',
  onChange,
  disabled = false,
  placeholder = 'vos@tutienda.com',
  className,
  onKeyDown,
  onBlur,
  ...props
}) {
  const [open, setOpen] = useState(false)
  const tecleando = useRef(false)
  const tipeoReciente = useRef(false)
  const inputRef = useRef(null)
  const sugerencias = sugerenciasDe(value)

  // Las sugerencias solo aparecen cuando el valor llegó por teclado: pegado o
  // autocompletado del navegador no activa el flag y el desplegable no estorba.
  function manejarKeyDown(event) {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Escape') {
      tecleando.current = false
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      if (open && sugerencias.length > 0) {
        event.preventDefault()
        elegir(sugerencias[0])
      }
      return
    }
    tecleando.current = true
    tipeoReciente.current = true
  }

  function manejarChange(event) {
    onChange?.(event.target.value)
    if (tipeoReciente.current) {
      tipeoReciente.current = false
      setOpen(sugerenciasDe(event.target.value).length > 0)
    }
  }

  function elegir(sugerencia) {
    onChange?.(sugerencia)
    tecleando.current = false
    setOpen(false)
    inputRef.current?.focus()
  }

  function perderFoco(event) {
    onBlur?.(event)
    tecleando.current = false
    setOpen(false)
  }

  return (
    <div className={`relative${className ? ` ${className}` : ''}`}>
      <Input
        {...props}
        ref={inputRef}
        type="email"
        className={cn('w-full', className)}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={manejarChange}
        onKeyDown={manejarKeyDown}
        onBlur={perderFoco}
      />
      {open && tecleando.current && sugerencias.length > 0 && (
        <ul
          role="listbox"
          aria-label="Sugerencias de correo"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-ink-500 bg-paper shadow-xl"
        >
          {sugerencias.map((sugerencia) => (
            <li key={sugerencia}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-fore transition hover:bg-ink-700"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => elegir(sugerencia)}
              >
                {sugerencia}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
