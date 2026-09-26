import { useState } from 'react'
import { Button, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { compartirArchivo, puedeCompartirArchivo } from '@/lib/printing/compartirDocumento'
import { documentoAPdf, nombrePdfDocumento } from '@/lib/printing/pdfDocumento'
import { descargarArchivo } from '@/utils/descargarArchivo'

// PDF profesional para compartir (cotizaciones y otros impresos): convierte el
// mismo HTML de «Descargar PDF» en un archivo PDF real, listo para adjuntar por
// WhatsApp/correo con el share sheet del sistema (o descargarlo si el navegador
// no comparte archivos). Un solo objeto para las pantallas.
export default function CompartirPdf({
  construirHtml,
  nombre = 'documento',
  titulo = '',
  texto = '',
  formato = 'a4',
  disabled = false,
  etiqueta = 'Compartir PDF',
  onResult,
}) {
  const toast = useToast()
  const [generando, setGenerando] = useState('')

  async function conPdf(accion) {
    if (generando) return
    setGenerando('pdf')
    try {
      const html = await (typeof construirHtml === 'function' ? construirHtml() : construirHtml)
      if (!html) {
        toast.error('No hay documento para compartir', 'Esperá a que la vista previa esté lista.')
        return
      }
      const blob = await documentoAPdf(html, { formato })
      if (!blob?.size) {
        toast.error('No se pudo generar el PDF', 'Probá de nuevo o usá «Imprimir».')
        return
      }
      const archivo = new File([blob], nombrePdfDocumento(String(nombre).replace(/\.pdf$/i, '')), { type: 'application/pdf' })
      await accion(blob, archivo)
    } catch {
      toast.error('No se pudo generar el PDF', 'Probá de nuevo o usá «Imprimir».')
    } finally {
      setGenerando('')
    }
  }

  const compartir = () => conPdf(async (blob, archivo) => {
    if (puedeCompartirArchivo(globalThis, archivo)) {
      const resultado = await compartirArchivo(globalThis, { archivo, titulo: titulo || nombre, texto })
      if (resultado === 'compartido') { onResult?.('compartido'); return }
      if (resultado === 'cancelado') return
    }
    if (descargarArchivo(archivo.name, blob, { tipo: 'application/pdf' })) {
      toast.info('PDF descargado', 'Este navegador no comparte archivos; adjuntalo desde tu correo o WhatsApp.')
      onResult?.('descargado')
    } else {
      toast.error('No se pudo compartir', 'Probá con «PDF».')
    }
  })

  const descargar = () => conPdf(async (blob, archivo) => {
    if (descargarArchivo(archivo.name, blob, { tipo: 'application/pdf' })) {
      toast.success('PDF descargado', archivo.name)
      onResult?.('descargado')
    } else {
      toast.error('No se pudo descargar', 'Probá de nuevo.')
    }
  })

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" disabled={disabled || Boolean(generando)} onClick={compartir} data-testid="compartir-pdf">
        <Icon name="share" className="h-4 w-4" />{generando ? 'Generando…' : etiqueta}
      </Button>
      <Button type="button" variant="outline" disabled={disabled || Boolean(generando)} onClick={descargar} title="Descargar PDF" aria-label="Descargar PDF" data-testid="descargar-pdf">
        <Icon name="download" className="h-4 w-4" />PDF
      </Button>
    </span>
  )
}
