import { useState } from 'react'
import { Button, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { anchoImagen, compartirArchivo, copiarImagen, documentoAPng, nombreImagenDocumento, puedeCompartirArchivo } from '@/lib/printing/compartirDocumento'
import { descargarArchivo } from '@/utils/descargarArchivo'

// Compartir un documento imprimible como imagen (#240/#220): convierte el mismo
// HTML de «Descargar PDF» en PNG y lo comparte (Web Share; si el navegador no
// comparte archivos, lo descarga), lo baja o lo copia al portapapeles. Un solo
// objeto para certificado, informe, constancia y etiquetas.
//
// `construirHtml` puede ser un HTML o una función (async): las etiquetas arman
// el suyo al vuelo. `formato` es el del papel ('a4', 'thermal-80'…) para que la
// imagen salga con el ancho real.
export default function CompartirImagen({
  construirHtml,
  nombre = 'documento',
  titulo = '',
  texto = '',
  formato = 'a4',
  disabled = false,
  onResult,
}) {
  const toast = useToast()
  const [generando, setGenerando] = useState('')

  async function conImagen(accion) {
    if (generando) return
    setGenerando(accion)
    try {
      const html = await (typeof construirHtml === 'function' ? construirHtml() : construirHtml)
      if (!html) {
        toast.error('No hay documento para compartir', 'Esperá a que la vista previa esté lista.')
        return
      }
      const imagen = await documentoAPng(html, { ancho: typeof formato === 'number' ? formato : anchoImagen(formato) })
      if (!imagen?.blob) {
        toast.error('No se pudo generar la imagen', 'Probá de nuevo o usá «Descargar PDF».')
        return
      }
      const archivo = new File([imagen.blob], nombreImagenDocumento(String(nombre).replace(/\.png$/i, '')), { type: 'image/png' })
      await accion(imagen, archivo)
    } catch {
      toast.error('No se pudo generar la imagen', 'Probá de nuevo o usá «Descargar PDF».')
    } finally {
      setGenerando('')
    }
  }

  const compartir = () => conImagen(async (imagen, archivo) => {
    if (puedeCompartirArchivo(globalThis, archivo)) {
      const resultado = await compartirArchivo(globalThis, { archivo, titulo: titulo || nombre, texto })
      if (resultado === 'compartido') { onResult?.('compartido'); return }
      if (resultado === 'cancelado') return
    }
    if (descargarArchivo(archivo.name, imagen.blob)) {
      toast.info('Imagen descargada', 'Este navegador no comparte archivos; el PNG quedó descargado.')
      onResult?.('descargado')
    } else {
      toast.error('No se pudo compartir', 'Probá con «PNG» o «Descargar PDF».')
    }
  })

  const descargar = () => conImagen(async (imagen, archivo) => {
    if (descargarArchivo(archivo.name, imagen.blob)) {
      toast.success('Imagen descargada', archivo.name)
      onResult?.('descargado')
    } else {
      toast.error('No se pudo descargar', 'Probá de nuevo.')
    }
  })

  const copiar = () => conImagen(async (imagen) => {
    if (await copiarImagen(imagen.blob, globalThis)) {
      toast.success('Imagen copiada', 'Pegala en el chat o donde la necesites.')
      onResult?.('copiado')
    } else {
      toast.info('No se pudo copiar la imagen', 'Usá «PNG» para descargarla.')
    }
  })

  const ocupado = Boolean(generando)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={disabled || ocupado} onClick={compartir} data-testid="compartir-imagen">
        <Icon name="share" className="h-4 w-4" />{generando === 'compartir' ? 'Generando…' : 'Compartir imagen'}
      </Button>
      <Button type="button" variant="ghost" disabled={disabled || ocupado} onClick={descargar} title="Descargar PNG" aria-label="Descargar PNG" data-testid="descargar-png">
        <Icon name="download" className="h-4 w-4" />{generando === 'descargar' ? 'Generando…' : 'PNG'}
      </Button>
      <Button type="button" variant="ghost" disabled={disabled || ocupado} onClick={copiar} title="Copiar imagen" aria-label="Copiar imagen" data-testid="copiar-png">
        <Icon name="copy" className="h-4 w-4" />{generando === 'copiar' ? 'Copiando…' : 'Copiar'}
      </Button>
    </span>
  )
}
