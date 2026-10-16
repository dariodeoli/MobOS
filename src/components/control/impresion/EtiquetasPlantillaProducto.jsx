import DocumentoPlantilla from './DocumentoPlantilla'
import { datosProductoPlantilla } from '@/lib/printing/renderPlantilla'
import { empresaImpresion } from '@/lib/printing/empresaImpresion'
export default function EtiquetasPlantillaProducto({ items, onMode }) {
  let data = [],
    dataError = ''
  try {
    data = datosProductoPlantilla(items, { brand: empresaImpresion().tenant?.name || 'MobOS' })
  } catch (error) {
    dataError = error.message
  }
  return (
    <DocumentoPlantilla
      kind="etiquetas-producto"
      data={data}
      dataError={dataError}
      onMode={onMode}
    />
  )
}
