// Adaptador de migración (#253): el campo vive en la biblioteca
// (`owncoding-ui/SerialField`); acá queda el normalizador que además entiende
// el QR de la etiqueta (`/u/<serial>`), inyectado por la prop `normalizar`.
import { SerialField as CampoSerial } from 'owncoding-ui'
import { leerEtiqueta } from '@/lib/printing/qr'

// IMEI/serial de UNA unidad: alfanumérico en mayúsculas, sin prefijo MOBOS:,
// sin espacios ni guiones. Acepta también el QR nuevo de la etiqueta, que llega
// como URL de la app (`/u/<serial>`). Para pegar VARIOS seriales no usar este
// campo: los flujos que aceptan listas normalizan con normalizeScan al enviar
// (Inventario recibe/traslada, ListaVentasDia).
export function normalizarSerial(value = '') {
  const etiqueta = leerEtiqueta(value)
  const crudo = etiqueta.tipo === '' || etiqueta.tipo === 'UNIDAD' ? etiqueta.valor : ''
  return String(crudo)
    .trim()
    .replace(/^MOBOS:/i, '')
    .replace(/[\s-]+/g, '')
    .toUpperCase()
}

export default function SerialField(props) {
  return <CampoSerial normalizar={normalizarSerial} {...props} />
}
