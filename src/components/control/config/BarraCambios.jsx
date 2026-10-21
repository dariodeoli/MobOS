import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'

// Barra de «cambios sin guardar» de Configuración (solo presentación).
// Observa los campos que se editan dentro de un <form> de la subpágina y,
// mientras haya uno sin enviar, muestra «Guardar» (envía ese mismo formulario,
// igual que su botón) y «Descartar» (vuelve a montar la sección con lo
// guardado). No decide qué se guarda ni cómo: la lógica sigue en cada form.
const IGNORAR = '[role="dialog"], [data-testid$="-reauth"], [data-sin-barra]'

export default function BarraCambios({ onDescartar }) {
  const marca = useRef(null)
  const formRef = useRef(null)
  const [sucio, setSucio] = useState(false)

  useEffect(() => {
    const raiz = marca.current?.parentElement
    if (!raiz) return undefined
    const alEditar = (event) => {
      const campo = event.target
      if (!(campo instanceof HTMLElement) || campo.type === 'search' || campo.type === 'file') return
      const form = campo.closest('form')
      if (!form || form.closest(IGNORAR)) return
      formRef.current = form
      setSucio(true)
    }
    const alEnviar = () => { formRef.current = null; setSucio(false) }
    const observador = new MutationObserver(() => {
      if (formRef.current && !formRef.current.isConnected) { formRef.current = null; setSucio(false) }
    })
    raiz.addEventListener('input', alEditar)
    raiz.addEventListener('change', alEditar)
    raiz.addEventListener('submit', alEnviar)
    raiz.addEventListener('reset', alEnviar)
    observador.observe(raiz, { childList: true, subtree: true })
    return () => {
      raiz.removeEventListener('input', alEditar)
      raiz.removeEventListener('change', alEditar)
      raiz.removeEventListener('submit', alEnviar)
      raiz.removeEventListener('reset', alEnviar)
      observador.disconnect()
    }
  }, [])

  return (
    <>
      <span ref={marca} hidden />
      {sucio && (
        <div role="region" aria-label="Cambios sin guardar" data-testid="config-cambios" className="config-barra-cambios">
          <span className="config-barra-punto" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-semibold">Cambios sin guardar</span>
          <Button type="button" variant="ghost" onClick={() => { formRef.current = null; setSucio(false); onDescartar?.() }}>Descartar</Button>
          <Button type="button" onClick={() => formRef.current?.requestSubmit?.()}>Guardar</Button>
        </div>
      )}
    </>
  )
}
