import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import { Skeleton } from '@/components/ui'

// Miniatura de un comprobante de pago. El archivo es privado: se baja con la
// sesión (apiFetch) y se muestra como imagen; al tocarla se abre en un Popup
// centrado (X roja). Los PDF y los archivos que no son imagen muestran un
// botón con el nombre. En la demo el comprobante trae su propia `demoUrl`.
export default function ComprobanteMiniatura({ paymentId, proof, tamano = 'h-16 w-16', titulo = 'Comprobante de pago' }) {
  const [url, setUrl] = useState(proof?.demoUrl || '')
  const [fallo, setFallo] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const esPdf = proof?.mimeType === 'application/pdf'

  useEffect(() => {
    if (proof?.demoUrl) { setUrl(proof.demoUrl); return undefined }
    let activo = true
    let objeto = ''
    setFallo(false)
    apiFetch(`/api/payments/${encodeURIComponent(paymentId)}/proofs/${encodeURIComponent(proof.id)}`)
      .then(respuesta => { if (!respuesta.ok) throw new Error('sin comprobante'); return respuesta.blob() })
      .then(blob => { if (!activo) return; objeto = URL.createObjectURL(blob); setUrl(objeto) })
      .catch(() => { if (activo) setFallo(true) })
    return () => { activo = false; if (objeto) URL.revokeObjectURL(objeto) }
  }, [paymentId, proof?.id, proof?.demoUrl])

  if (fallo) {
    return <span className={`grid ${tamano} shrink-0 place-items-center rounded-lg border border-ink-600 text-mute`} title="No se pudo cargar el comprobante"><Icon name="alert" className="h-4 w-4" /></span>
  }
  if (!url) return <Skeleton className={`${tamano} shrink-0 rounded-lg bg-ink-700`} />
  const nombre = proof?.fileName || proof?.name || 'comprobante'
  return (
    <>
      <button
        type="button"
        data-testid="comprobante-miniatura"
        aria-label={`Ver ${titulo.toLowerCase()}: ${nombre}`}
        onClick={() => setAbierto(true)}
        className={`${tamano} shrink-0 overflow-hidden rounded-lg border border-ink-600 transition hover:border-fono`}
      >
        {esPdf
          ? <span className="grid h-full w-full place-items-center text-fono-light"><Icon name="report" className="h-5 w-5" /></span>
          : <img src={url} alt={nombre} className="h-full w-full object-cover" />}
      </button>
      <Popup open={abierto} onClose={() => setAbierto(false)} tipo="detalle" title={titulo} testId="comprobante-visor">
        <div className="flex justify-center">
          {esPdf
            ? <a className="text-sm font-semibold text-fono-light underline" href={url} target="_blank" rel="noreferrer">Abrir {nombre}</a>
            : <img src={url} alt={nombre} className="max-h-[70vh] max-w-full rounded-lg object-contain" />}
        </div>
      </Popup>
    </>
  )
}
