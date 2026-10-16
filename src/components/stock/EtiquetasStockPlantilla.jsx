import { useMemo, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import EtiquetasPlantillaUnidad from '@/components/control/impresion/EtiquetasPlantillaUnidad'
import EtiquetasPlantillaProducto from '@/components/control/impresion/EtiquetasPlantillaProducto'
import { itemsEtiquetasStock } from '@/lib/printing/etiquetasStock'
export default function EtiquetasStockPlantilla({ filas, onClose, onHabitual }) {
  const selection = useMemo(() => {
    try {
      return itemsEtiquetasStock(filas)
    } catch (error) {
      return { error: error.message }
    }
  }, [filas])
  const [unitMode, setUnitMode] = useState('loading')
  const [productMode, setProductMode] = useState('loading')
  const legacy =
    !selection.error &&
    (!selection.unidades.length || unitMode === 'legacy') &&
    (!selection.productos.length || productMode === 'legacy')
  return (
    <Modal open onClose={onClose} title="Etiquetas de Stock" size="amplio">
      {selection.error ? (
        <p role="alert">{selection.error}</p>
      ) : (
        <div className="space-y-3">
          <p>
            {selection.total} etiquetas. Cada tipo conserva su papel y se descarga en un PDF
            separado.
          </p>
          {selection.unidades.length > 0 && (
            <EtiquetasPlantillaUnidad
              units={selection.unidades.map(item => item.unit)}
              onMode={setUnitMode}
            />
          )}
          {selection.productos.length > 0 && (
            <EtiquetasPlantillaProducto items={selection.productos} onMode={setProductMode} />
          )}
        </div>
      )}
      <Button className="min-h-11 mt-3" disabled={!legacy} onClick={onHabitual}>
        Continuar con formato habitual
      </Button>
    </Modal>
  )
}
