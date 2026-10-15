// Llegada de mercadería (#408, unidad G): reglas puras de la pantalla. Sin red
// ni React: el color de la fila, el agrupado por bloque de fecha, qué arreglo
// ofrece cada hallazgo y las etiquetas. Los datos son los de /api/supply/arrivals.

export const DESTINOS = [
  { value: 'STOCK', label: 'Stock' },
  { value: 'OTRA_SUCURSAL', label: 'Otra sucursal' },
  { value: 'DEVOLVER', label: 'Devolver' },
  { value: 'FALTA_IMEI', label: 'Falta IMEI' },
  { value: 'TECNICO', label: 'Técnico' },
]

export const MATCHES = {
  EXACTO: { label: 'Exacto', color: 'green' },
  POR_MODELO: { label: 'Por modelo', color: 'blue' },
  SOBRANTE: { label: 'Sobrante', color: 'orange' },
  NO_LLEGO: { label: 'No llegó', color: 'red' },
}

export const etiquetaDestino = (valor) => DESTINOS.find((item) => item.value === valor)?.label || valor || '—'

export const esPreVendida = (linea) => linea?.destination === 'STOCK' && Boolean(linea.orderItemId || linea.orderId || linea.customerId)

// Condición visual de la fila: define el fondo suave (tokens del tema, nunca colores crudos).
export function condicionFila(linea) {
  if (!linea) return 'stock'
  if (linea.match === 'NO_LLEGO') return 'noLlego'
  if (linea.destination === 'OTRA_SUCURSAL') return 'otra'
  if (linea.destination === 'DEVOLVER') return 'devolver'
  if (linea.destination === 'FALTA_IMEI') return 'faltaImei'
  if (linea.destination === 'TECNICO') return 'tecnico'
  if (esPreVendida(linea)) return 'preVendido'
  return 'stock'
}

export const FONDO_FILA = {
  stock: '',
  preVendido: 'bg-ok/10',
  otra: 'bg-info/10',
  devolver: 'bg-warn/10',
  faltaImei: 'bg-warn/10',
  tecnico: 'bg-mute/10',
  noLlego: 'bg-bad/10 text-mute',
}

export const NOMBRE_CONDICION = {
  stock: 'Stock',
  preVendido: 'Pre-vendido',
  otra: 'A otra sucursal',
  devolver: 'Devolver',
  faltaImei: 'Falta IMEI',
  tecnico: 'Técnico',
  noLlego: 'No llegó',
}

export const issuesDe = (linea) => (Array.isArray(linea?.issues) ? linea.issues : [])
export const erroresDe = (linea) => issuesDe(linea).filter((item) => item.severity === 'error')
export const avisosDe = (linea) => issuesDe(linea).filter((item) => item.severity !== 'error')

export function luhnValido(digitos) {
  if (!/^\d+$/.test(digitos)) return false
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let n = digitos.charCodeAt(i) - 48
    if (doble) { n *= 2; if (n > 9) n -= 9 }
    suma += n
    doble = !doble
  }
  return suma % 10 === 0
}

// «El IMEI es correcto»: 15 dígitos que terminan en 000 y pasan Luhn. Nunca la notación científica.
export function imeiConfirmable(valor) {
  const limpio = String(valor || '').replace(/[\s-]+/g, '')
  return /^\d{15}$/.test(limpio) && /0{3}$/.test(limpio) && luhnValido(limpio)
}

const FAMILIA = {
  ELEGIR_PRODUCTO: 'producto',
  PRODUCTO_NO_ENCONTRADO: 'producto',
  PRODUCTO_INVALIDO: 'producto',
  IMEI_EXCEL: 'serial',
  IMEI_INVALIDO: 'serial',
  SERIAL_INVALIDO: 'serial',
  SERIAL_FALTA: 'serial',
  SERIAL_EXISTENTE: 'serial',
  DUPLICADO_EN_LOTE: 'serial',
  SUCURSAL_DESTINO_FALTA: 'sucursal',
  SUCURSAL_DESTINO_IGUAL: 'sucursal',
  SUCURSAL_DESTINO_INVALIDA: 'sucursal',
  PEDIDO_AMBIGUO: 'vinculo',
  PEDIDO_NO_ENCONTRADO: 'vinculo',
  PEDIDO_SIN_LINEA_PENDIENTE: 'vinculo',
  PEDIDO_INVALIDO: 'vinculo',
  CLIENTE_AMBIGUO: 'vinculo',
  CLIENTE_NO_ENCONTRADO: 'vinculo',
  CLIENTE_INVALIDO: 'vinculo',
  PEDIDO_LINEA_INVALIDA: 'vinculo',
  PEDIDO_LINEA_OTRO_PRODUCTO: 'vinculo',
  PEDIDO_LINEA_SIN_PENDIENTE: 'vinculo',
}

// Arreglos que ofrece la fila: cada hallazgo apunta a un control junto a él.
export function arreglosDe(linea) {
  return [...new Set(issuesDe(linea).map((item) => FAMILIA[item.code]).filter(Boolean))]
}

export function agruparPorBloque(lineas = []) {
  const grupos = []
  for (const linea of lineas) {
    const fecha = linea.raw?.blockDate || null
    const etiqueta = linea.raw?.blockLabel || fecha || 'Sin fecha'
    const clave = `${fecha || ''}|${etiqueta}`
    let grupo = grupos[grupos.length - 1]
    if (!grupo || grupo.clave !== clave) {
      grupo = { clave, fecha, etiqueta, lineas: [] }
      grupos.push(grupo)
    }
    grupo.lineas.push(linea)
  }
  return grupos
}

export const nombreModelo = (linea) => linea?.product?.name || linea?.raw?.modelText || 'Sin modelo'

export const puedeConfirmar = (llegada) =>
  Boolean(llegada && llegada.status === 'BORRADOR' && (llegada.lines || []).length > 0 && !(llegada.summary?.errores > 0))

export const claveOperacion = (prefijo) => `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 100)

// Etiquetas de unidad para las líneas que ingresaron (una por equipo con IMEI/serie).
export function etiquetasDeLlegada(lineas = [], codigo = '') {
  const lista = lineas.filter((linea) => linea.match !== 'NO_LLEGO' && linea.destination !== 'DEVOLVER' && linea.serial)
  return lista.map((linea, indice) => ({
    n: indice + 1,
    total: lista.length,
    producto: nombreModelo(linea),
    condicion: linea.condition || '',
    imei: linea.serial,
    pendiente: false,
    compra: codigo,
    destino: linea.destination === 'OTRA_SUCURSAL' ? 'Otra sucursal' : '',
  }))
}

export const formatoCosto = (linea) => (linea?.originalCost == null ? '—' : Number(linea.originalCost).toLocaleString('es-PY', { maximumFractionDigits: 2 }))
