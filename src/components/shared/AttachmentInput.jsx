import { useRef, useState } from 'react'
import { comprimirImagen } from '@/utils/imagen'

// Adjuntos JPG/PNG/WebP/PDF de hasta 5 MiB: misma regla que el backend, pero
// verificada en el cliente antes de llamar a onSelect. Con onError el aviso lo
// pinta el padre; sin onError el campo muestra su propio role="alert".
export const MENSAJE_ADJUNTO = 'El adjunto debe ser JPG, PNG, WebP o PDF de hasta 5 MiB.'
export const ADJUNTOS_ACEPTADOS = 'image/jpeg,image/png,image/webp,application/pdf'
export const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024

export default function AttachmentInput({
  onSelect,
  onError,
  disabled = false,
  accept = ADJUNTOS_ACEPTADOS,
  maxBytes = MAX_ADJUNTO_BYTES,
  className,
  inputRef,
  id,
  children,
  ...props
}) {
  const propioRef = useRef(null)
  const ref = inputRef || propioRef
  const [error, setError] = useState('')

  async function seleccionar(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const tipos = accept.split(',').map((tipo) => tipo.trim())
    if (!tipos.includes(file.type)) {
      setError(MENSAJE_ADJUNTO)
      onError?.(MENSAJE_ADJUNTO)
      return
    }
    // Las fotos se comprimen antes de subir (con fallback al original): el
    // límite del cliente y del backend sigue siendo el mismo.
    const listo = file.type.startsWith('image/') ? await comprimirImagen(file) : file
    if (listo.size > maxBytes) {
      setError(MENSAJE_ADJUNTO)
      onError?.(MENSAJE_ADJUNTO)
      return
    }
    setError('')
    onSelect?.(listo)
  }

  return (
    <>
      {children}
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={seleccionar}
        className={className}
        {...props}
      />
      {error && !onError && (
        <p role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </>
  )
}
