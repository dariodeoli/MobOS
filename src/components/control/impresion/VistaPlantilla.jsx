import { useEffect, useRef, useState } from 'react'
import VistaPreviaPapel from '@/components/shared/VistaPreviaPapel'
import { desbordesPlantilla } from '@/lib/printing/renderPlantilla'
import { MM_A_PX } from '@/lib/printing/geometria'
export default function VistaPlantilla({ render, onErrors }) {
  const wrapper = useRef(null),
    [width, setWidth] = useState(300)
  useEffect(() => {
    const node = wrapper.current
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    setWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])
  const page = render?.pages[0],
    paperWidth = (page?.size.widthMm || 80) * MM_A_PX,
    scale = Math.min(1, width / paperWidth)
  const paperHeight = page?.size.heightMm ? page.size.heightMm * MM_A_PX : 600
  return (
    <div ref={wrapper} className="min-w-0" data-testid="plantilla-preview">
      <p className="mb-2 text-xs text-mute">
        Vista previa · documento 1 de {render?.count || 0} · escala de pantalla{' '}
        {Math.round(scale * 100)}%. El PDF conserva las medidas físicas.
      </p>
      {page && (
        <div
          className="relative max-h-[65vh] overflow-y-auto"
          style={{ height: paperHeight * scale + 2 }}
        >
          <VistaPreviaPapel
            titulo="Vista previa de la plantilla"
            contenido={page.html}
            formato="personalizado"
            alto=""
            sandbox="allow-same-origin"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: paperWidth,
              height: paperHeight + 2,
              maxWidth: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            onLoad={event => {
              const doc = event.currentTarget.contentDocument
              if (doc) onErrors?.(desbordesPlantilla(doc))
            }}
          />
        </div>
      )}
    </div>
  )
}
