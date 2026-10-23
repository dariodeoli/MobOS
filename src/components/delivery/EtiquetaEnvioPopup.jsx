import { useEffect, useState } from 'react'
import { Aviso, FormField, Input, Select, useToast } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import { soloDigitos } from '@/utils/telefono'
import { MAX_BULTOS, VARIANTES_ENVIO } from '@/lib/printing/etiquetaEnvio'
import { imprimirEtiquetasEnvio, varianteEnvioRecordada } from '@/lib/printing/etiquetaEnvioImpresion'

// Etiqueta de envío 10 × 15 cm: elige bultos y diseño y abre el diálogo de
// impresión con una etiqueta por página. Lo usa Delivery (por pedido y en lote)
// y el detalle del pedido (entrada mínima del menú «Más acciones»).
export default function EtiquetaEnvioPopup({ open, ordenes = [], onClose }) {
  const toast = useToast()
  const [bultos, setBultos] = useState('1')
  const [variante, setVariante] = useState('estandar')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBultos('1'); setError(''); setOcupado(false)
    setVariante(varianteEnvioRecordada())
  }, [open])

  async function imprimir() {
    if (ocupado) return
    const cantidad = Math.max(1, Math.min(MAX_BULTOS, Number(bultos) || 1))
    setOcupado(true); setError('')
    try {
      const resultado = await imprimirEtiquetasEnvio(ordenes, { bultos: cantidad, variante })
      if (!resultado.ok) throw new Error('No se pudo abrir la impresión. Revisá el bloqueo de ventanas del navegador.')
      toast.success('Etiquetas listas', `${resultado.total} ${resultado.total === 1 ? 'etiqueta' : 'etiquetas'} de 10 × 15 cm en el diálogo de impresión.`)
      onClose?.()
    } catch (cause) {
      setError(cause?.message || 'No se pudo armar la etiqueta.')
    } finally { setOcupado(false) }
  }

  return (
    <Popup
      open={open}
      onClose={() => !ocupado && onClose?.()}
      busy={ocupado}
      title="Etiqueta de envío 10 × 15"
      testId="etiqueta-envio-popup"
      acciones={{
        secundaria: { label: 'Cancelar', disabled: ocupado, onClick: () => onClose?.() },
        primaria: { label: ocupado ? 'Armando…' : 'Imprimir', disabled: ocupado || !ordenes.length, onClick: imprimir, 'data-testid': 'etiqueta-envio-imprimir' },
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-mute">
          {ordenes.length === 1 ? 'Una etiqueta por bulto del pedido.' : `${ordenes.length} pedidos: una etiqueta por bulto y por pedido, una por página.`} Tamaño 100 × 150 mm (4×6&quot;), en blanco y negro.
        </p>
        <FormField label="Bultos por pedido" htmlFor="envio-bultos">
          <Input id="envio-bultos" inputMode="numeric" maxLength={2} className="w-24" value={bultos} onChange={event => setBultos(soloDigitos(event.target.value, 2))} />
        </FormField>
        <FormField label="Diseño" htmlFor="envio-variante">
          <Select id="envio-variante" className="w-full" value={variante} onChange={event => setVariante(event.target.value)}>
            {Object.entries(VARIANTES_ENVIO).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </Select>
        </FormField>
        <p className="text-xs text-mute">En el diálogo elegí tu impresora de etiquetas y el papel 100 × 150 mm; sin márgenes y a escala 100 %.</p>
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Popup>
  )
}
