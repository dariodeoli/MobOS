// "Último usado como predeterminado" en impresión (#209): por tipo de documento
// recordamos la impresora (destino + ancho) y, cuando aplica, el formato, para
// que la próxima impresión del mismo tipo salga donde salió la última vez.
//
// Reglas del patrón: solo selecciones (nunca permisos ni acciones destructivas),
// siempre cambiable (la memoria se ignora si la impresora ya no existe o está
// inactiva) y visible (Configuración → Impresoras muestra qué se recordó y
// permite olvidarlo). El núcleo es puro y recibe el storage: se testea sin
// navegador.

const CLAVE = 'mobos:impresion:ultimo'

export const TIPOS_DOCUMENTO = Object.freeze({
  comprobante: 'Comprobante',
  'nota-entrega': 'Nota de entrega',
  remision: 'Remisión',
  'recibo-interno': 'Recibo interno',
  proforma: 'Proforma',
  etiqueta: 'Etiquetas',
  // Tipos reales del taller/inventario (Ruteo de documentos los muestra con su nombre).
  'etiquetas-stock': 'Etiquetas de unidades',
  'etiquetas-lote': 'Etiquetas del lote',
  'etiqueta-stock': 'Etiqueta de unidad',
  'etiquetas-producto': 'Etiquetas de góndola',
  'etiqueta-ubicacion': 'Etiqueta de ubicación',
  'cierre-caja': 'Cierre de caja',
  'resumen-dia': 'Resumen del día',
  'imei-check': 'Verificación de IMEI',
  'informe-dispositivo': 'Informe de dispositivo',
  'certificado-phonecheck': 'Certificado de inspección',
  'constancia-preparacion': 'Constancia de preparación',
  'comprobante-recepcion': 'Comprobante de recepción',
  'lista-compra': 'Lista de compra',
})

export const etiquetaTipoImpresion = (tipo) => TIPOS_DOCUMENTO[tipo] || String(tipo || '').replace(/-/g, ' ') || 'Impresión'

/** Núcleo puro: mismo comportamiento con localStorage, sessionStorage o un mock. */
export function crearMemoriaImpresion(storage) {
  const leer = () => {
    try { return JSON.parse(storage?.getItem(CLAVE) || '{}') || {} } catch { return {} }
  }
  const escribir = (datos) => {
    try { storage?.setItem(CLAVE, JSON.stringify(datos)) } catch { /* sin almacenamiento */ }
  }
  return {
    impresoraDe: (tipo) => leer()[String(tipo)]?.destino || '',
    formatoDe: (tipo) => leer()[String(tipo)]?.formato || '',
    recordarImpresora: (tipo, { destino, ancho } = {}) => {
      if (!tipo || !destino) return
      const datos = leer()
      datos[String(tipo)] = { ...datos[String(tipo)], destino: String(destino), ...(Number(ancho) ? { ancho: Number(ancho) } : {}) }
      escribir(datos)
    },
    recordarFormato: (tipo, formato) => {
      if (!tipo || !formato) return
      const datos = leer()
      datos[String(tipo)] = { ...datos[String(tipo)], formato: String(formato) }
      escribir(datos)
    },
    olvidar: (tipo) => {
      const datos = leer()
      delete datos[String(tipo)]
      escribir(datos)
    },
    todas: () => leer(),
  }
}

const memoria = crearMemoriaImpresion(typeof localStorage !== 'undefined' ? localStorage : null)

export const impresoraDeTipo = (tipo) => memoria.impresoraDe(tipo)
export const formatoDeTipo = (tipo) => memoria.formatoDe(tipo)
export const recordarImpresoraDeTipo = (tipo, datos) => memoria.recordarImpresora(tipo, datos)
export const recordarFormatoDeTipo = (tipo, formato) => memoria.recordarFormato(tipo, formato)
export const olvidarTipoDeImpresion = (tipo) => memoria.olvidar(tipo)
export const memoriaDeImpresion = () => memoria.todas()

// ── Formato 58 mm (#426) ────────────────────────────────────────────
// La térmica de la tienda es de 80 mm y el otro formato es A4: el 58 mm queda
// fuera de los selectores y de las vistas previas salvo que se encienda en
// Configuración › Impresión y dispositivos › «Formato 58 mm» (apagado por
// defecto). Es una preferencia del equipo, como el resto de este módulo.
const CLAVE_58 = 'mobos:impresion:formato-58'
export const EVENTO_FORMATO_58 = 'mobos:formato-58'

/** Núcleo puro: recibe el storage (se testea sin navegador). */
export function crearPreferenciaFormato58(storage) {
  return {
    activo: () => {
      try { return storage?.getItem(CLAVE_58) === '1' } catch { return false }
    },
    fijar: (valor) => {
      try { storage?.setItem(CLAVE_58, valor ? '1' : '0') } catch { /* sin almacenamiento */ }
    },
  }
}

const preferencia58 = crearPreferenciaFormato58(typeof localStorage !== 'undefined' ? localStorage : null)

export const formato58Activo = () => preferencia58.activo()
export function fijarFormato58(valor) {
  preferencia58.fijar(Boolean(valor))
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_FORMATO_58)) } catch { /* sin ventana */ }
}

const es58 = (id) => /58$/.test(String(id)) || String(id) === 'thermal'

/**
 * Filtra una lista de formatos ([id, etiqueta]) o de anchos (58 | 80): sin el
 * interruptor, el 58 mm no se ofrece. `actual` conserva el valor ya elegido
 * (una impresora de 58 mm existente no pierde su ancho en el formulario).
 */
export function formatosVisibles(lista = [], { activo = formato58Activo(), actual = null } = {}) {
  if (activo) return lista
  return lista.filter((item) => {
    const id = Array.isArray(item) ? item[0] : item
    if (actual !== null && String(id) === String(actual)) return true
    return !es58(id)
  })
}

/** Formato válido para mostrar: con el 58 mm apagado, cae a 80 mm. */
export const formatoPermitido = (formato, { activo = formato58Activo() } = {}) => (!activo && es58(formato) ? 'thermal-80' : formato)

