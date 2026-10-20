import { useState } from 'react'
import { BuscadorProveedor } from 'owncoding-ui'
import SelectorResultadoCompacto from '@/components/shared/SelectorResultadoCompacto'

const formatearProveedor = (proveedor) => [proveedor.code, proveedor.name || proveedor.nombre].filter(Boolean).join(' · ')

// Conserva los contratos de MobOS: id en Compras, texto libre en recepción y
// memoria de últimos usados al elegir o crear. El campo compartido confirma
// una sola vez y cancela el texto anterior al recibir un reset controlado.
export default function SupplierCombobox({
  value = '', onSelect, onUsado, onLibre, onCreate, etiquetaNuevo,
  proveedores = [], onClear, inputProps, datosCompletosEnMovil = false,
  confirmarAlTipear = false, confirmarAlSalir = true,
  limiteSugerencias: _limiteSugerencias, ...props
}) {
  const [reenfocar, setReenfocar] = useState(false)
  const limpiar = () => { setReenfocar(true); onClear?.() }
  const seleccionado = value && value !== 'new'
    ? proveedores.find(proveedor => proveedor.id === value)
    : null
  if (seleccionado) {
    return <SelectorResultadoCompacto
      datosCompletosEnMovil={datosCompletosEnMovil}
      nombre={formatearProveedor(seleccionado)}
      detalles={[seleccionado.document ? `CI/RUC ${seleccionado.document}` : '', seleccionado.phone, seleccionado.city].filter(Boolean)}
      detallesCompletos={datosCompletosEnMovil ? [seleccionado.document ? `CI/RUC ${seleccionado.document}` : '', seleccionado.phone].filter(Boolean) : []}
      etiquetaCambiar="Cambiar proveedor"
      etiquetaQuitar="Quitar proveedor"
      onCambiar={onClear ? limpiar : undefined}
      onQuitar={onClear ? limpiar : undefined}
      testId="proveedor-seleccionado"
    />
  }
  return <BuscadorProveedor {...props} inputProps={{ ...inputProps, autoFocus: reenfocar || inputProps?.autoFocus }} proveedores={proveedores} value={value} onLibre={onLibre} formatearValor={formatearProveedor}
    onSelect={(proveedor) => { onSelect?.(proveedor); onUsado?.(proveedor) }}
    onCreate={onCreate} textoCrear={etiquetaNuevo || '＋ Crear'}
    confirmarAlSalir={confirmarAlSalir} confirmarAlTipear={confirmarAlTipear} />
}
