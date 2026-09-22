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
  'cierre-caja': 'Cierre de caja',
  'resumen-dia': 'Resumen del día',
  'imei-check': 'Verificación de IMEI',
  'informe-dispositivo': 'Informe de dispositivo',
  'certificado-phonecheck': 'Certificado de inspección',
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
