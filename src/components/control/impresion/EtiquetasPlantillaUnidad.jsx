import DocumentoPlantilla from './DocumentoPlantilla'
import { datosUnidadPlantilla } from '@/lib/printing/renderPlantilla'
import { empresaImpresion } from '@/lib/printing/empresaImpresion'
export default function EtiquetasPlantillaUnidad({ units, onMode }) {
  let data = [],
    dataError = ''
  try {
    data = datosUnidadPlantilla(units, { brand: empresaImpresion().tenant?.name || 'MobOS' })
  } catch (error) {
    dataError = error.message
  }
  return (
    <DocumentoPlantilla kind="etiquetas-stock" data={data} dataError={dataError} onMode={onMode} />
  )
}
