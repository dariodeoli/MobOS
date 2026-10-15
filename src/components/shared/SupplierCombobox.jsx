import { BuscadorProveedor } from 'owncoding-ui'

const formatearProveedor = (proveedor) => [proveedor.code, proveedor.name || proveedor.nombre].filter(Boolean).join(' · ')

// Conserva los contratos de MobOS: id en Compras, texto libre en recepción y
// memoria de últimos usados al elegir o crear. El campo compartido confirma
// una sola vez y cancela el texto anterior al recibir un reset controlado.
export default function SupplierCombobox({
  value = '', onSelect, onUsado, onLibre, onCreate, etiquetaNuevo,
  confirmarAlTipear = false, confirmarAlSalir = true,
  limiteSugerencias: _limiteSugerencias, ...props
}) {
  return <BuscadorProveedor {...props} value={value} onLibre={onLibre} formatearValor={formatearProveedor}
    onSelect={(proveedor) => { onSelect?.(proveedor); onUsado?.(proveedor) }}
    onCreate={onCreate} textoCrear={etiquetaNuevo || '＋ Crear'}
    confirmarAlSalir={confirmarAlSalir} confirmarAlTipear={confirmarAlTipear} />
}
