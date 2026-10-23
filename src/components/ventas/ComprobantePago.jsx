import { useEffect, useState } from 'react'
import AttachmentInput from '@/components/shared/AttachmentInput'
import Icon from '@/components/shared/Icon'
import { Button } from '@/components/ui'
import { isDemoRuntime } from '@/lib/demoMode'
import { tamanoLegible } from '@/lib/comprobantePos'
import { cn } from '@/lib/utils'

// Comprobante del cobro en el mismo POS: foto con la cámara (`capture`) o archivo,
// miniatura y «Quitar». El archivo solo vive en memoria hasta que la venta se
// guarda; recién ahí se sube al pedido (privado). Nunca se guarda en el borrador.
const SOLO_IMAGENES = 'image/jpeg,image/png,image/webp'

// Comprobante ficticio de la demo: nada sale del navegador.
function archivoDeEjemplo() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" fill="#f4f6f8"/><rect x="14" y="14" width="212" height="292" rx="10" fill="#fff" stroke="#c9d1d9"/><text x="120" y="52" font-family="Arial" font-size="14" font-weight="700" text-anchor="middle" fill="#1f2933">Comprobante</text><text x="120" y="72" font-family="Arial" font-size="10" text-anchor="middle" fill="#52606d">Ejemplo (demo)</text><line x1="30" y1="90" x2="210" y2="90" stroke="#d9dee3"/><text x="30" y="118" font-family="Arial" font-size="10" fill="#52606d">Estado</text><text x="210" y="118" font-family="Arial" font-size="11" text-anchor="end" fill="#127c3a">Realizado</text><rect x="80" y="170" width="80" height="80" fill="#e4e7eb"/><text x="120" y="215" font-family="Arial" font-size="9" text-anchor="middle" fill="#7b8794">QR ficticio</text></svg>'
  return { name: 'comprobante-demo.svg', size: svg.length, type: 'image/svg+xml', demoUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
}

function Miniatura({ file }) {
  const [url, setUrl] = useState(file?.demoUrl || '')
  useEffect(() => {
    if (file?.demoUrl) { setUrl(file.demoUrl); return undefined }
    if (!file || file.type === 'application/pdf' || typeof URL.createObjectURL !== 'function') { setUrl(''); return undefined }
    const objeto = URL.createObjectURL(file)
    setUrl(objeto)
    return () => URL.revokeObjectURL(objeto)
  }, [file])
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-600 bg-ink-800" data-testid="comprobante-pos-miniatura">
      {url ? <img src={url} alt="Comprobante adjunto" className="h-full w-full object-cover" /> : <Icon name="report" className="h-5 w-5 text-fono-light" />}
    </span>
  )
}

/**
 * @param comprobante `{ file }` o undefined
 * @param obligatorio la empresa exige el comprobante para confirmar el cobro
 * @param onChange recibe `{ file }` o `undefined` al quitarlo
 */
export default function ComprobantePago({ comprobante, obligatorio = true, onChange, disabled = false, indice = 0, className }) {
  const file = comprobante?.file || null
  const [error, setError] = useState('')
  function elegir(nuevo) { setError(''); onChange?.({ file: nuevo }) }
  return (
    <div data-testid="pago-comprobante" data-estado={file ? 'adjunto' : 'falta'} className={cn('rounded-xl border px-2.5 py-1.5', file ? 'border-ok/30 bg-ok/5' : obligatorio ? 'border-dashed border-warn/50 bg-warn/5' : 'border-dashed border-ink-500', className)}>
      {file ? (
        <div className="flex items-center gap-2">
          <Miniatura file={file} />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm text-fore" title={file.name}>{file.name || 'Comprobante'}</b>
            <span className="block truncate text-[11px] text-mute">{[tamanoLegible(file.size), 'se sube al guardar la venta'].filter(Boolean).join(' · ')}</span>
          </div>
          <button
            type="button"
            data-testid="comprobante-quitar"
            aria-label={`Quitar comprobante del pago ${indice + 1}`}
            disabled={disabled}
            onClick={() => { setError(''); onChange?.(undefined) }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad disabled:opacity-40"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 flex-1 basis-40 text-xs leading-snug">
            <b className="block text-sm text-fore">Comprobante {obligatorio ? <span className="font-semibold text-warn">obligatorio</span> : <span className="font-semibold text-mute">opcional</span>}</b>
            <span className="text-mute">Se sube al guardar y queda como «Pendiente de verificación».</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <AttachmentInput accept={SOLO_IMAGENES} capture="environment" disabled={disabled} onSelect={elegir} onError={setError} aria-label={`Sacar foto del comprobante del pago ${indice + 1}`}>
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={disabled}><Icon name="image" className="h-4 w-4" />Sacar foto</Button>
            </AttachmentInput>
            <AttachmentInput disabled={disabled} onSelect={elegir} onError={setError} aria-label={`Adjuntar comprobante del pago ${indice + 1}`}>
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={disabled}>Adjuntar comprobante</Button>
            </AttachmentInput>
            {isDemoRuntime && (
              <Button type="button" variant="ghost" className="min-h-11 px-3 text-xs" disabled={disabled} data-testid="comprobante-usar-ejemplo" onClick={() => elegir(archivoDeEjemplo())}>Usar ejemplo</Button>
            )}
          </span>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}
