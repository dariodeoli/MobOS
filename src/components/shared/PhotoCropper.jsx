import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { LADO_FOTO, recorteCuadrado, recortarArchivo } from '@/utils/recorte'

// Recorte de foto antes de subir: el cuadrado visible se arrastra y se acerca,
// y al confirmar se genera la imagen recortada (cuadrada) que viaja al servidor.
const LADO_VISTA = 240

export default function PhotoCropper({ file, onCancel, onCropped, lado = LADO_FOTO }) {
  const [url, setUrl] = useState('')
  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 })
  const [escala, setEscala] = useState(1)
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const [recortando, setRecortando] = useState(false)
  const arrastre = useRef(null)

  useEffect(() => {
    if (!file) { setUrl(''); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    setEscala(1)
    setDesplazamiento({ x: 0, y: 0 })
    setError('')
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const recorte = recorteCuadrado({ ancho: tamano.ancho, alto: tamano.alto, escala, desplazamientoX: desplazamiento.x, desplazamientoY: desplazamiento.y, lado: LADO_VISTA })

  function mover(event) {
    if (!arrastre.current) return
    setDesplazamiento({
      x: arrastre.current.x + (event.clientX - arrastre.current.puntoX),
      y: arrastre.current.y + (event.clientY - arrastre.current.puntoY),
    })
  }

  async function confirmar() {
    if (!file || !tamano.ancho) return
    setRecortando(true); setError('')
    try {
      onCropped(await recortarArchivo(file, { recorte, lado }))
    } catch (cause) {
      setError(cause?.message || 'No se pudo recortar la foto.')
    } finally { setRecortando(false) }
  }

  return (
    <Modal open={Boolean(file)} onClose={onCancel} title="Recortar foto" size="corto">
      <div className="space-y-3">
        <p className="text-sm text-mute">Arrastrá para mover y usá el zoom para acercar. El recorte queda cuadrado, como se ve en la app.</p>
        <div
          className="relative mx-auto h-60 w-60 touch-none overflow-hidden rounded-xl border border-ink-600 bg-ink-800"
          onPointerDown={(event) => { arrastre.current = { puntoX: event.clientX, puntoY: event.clientY, x: desplazamiento.x, y: desplazamiento.y }; event.currentTarget.setPointerCapture(event.pointerId) }}
          onPointerMove={mover}
          onPointerUp={() => { arrastre.current = null }}
        >
          {url && (
            <img
              src={url}
              alt="Foto a recortar"
              draggable={false}
              onLoad={(event) => setTamano({ ancho: event.target.naturalWidth, alto: event.target.naturalHeight })}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: LADO_VISTA * escala,
                height: tamano.ancho ? (tamano.alto / tamano.ancho) * LADO_VISTA * escala : LADO_VISTA * escala,
                transform: `translate(calc(-50% + ${desplazamiento.x}px), calc(-50% + ${desplazamiento.y}px))`,
              }}
            />
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl border-2 border-fono/60" />
        </div>
        <label className="block text-xs text-mute">
          Zoom
          <input type="range" min="1" max="3" step="0.05" value={escala} onChange={(event) => setEscala(Number(event.target.value))} className="mt-1 w-full accent-fono" />
        </label>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={recortando}>Cancelar</Button>
          <Button type="button" onClick={confirmar} disabled={recortando || !tamano.ancho}>{recortando ? 'Recortando…' : 'Usar esta foto'}</Button>
        </div>
      </div>
    </Modal>
  )
}
