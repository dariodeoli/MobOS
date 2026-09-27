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
  // Tipos reales del taller/inventario (Formatos los muestra con su nombre).
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

// #277 · Plantilla del ticket de prueba por impresora (destino), con el patrón
// «último usado = predeterminado» (#209): el ticket corto es el inicial y al
// imprimir se recuerda lo último elegido. El editor de la ficha guarda acá.
export const PLANTILLA_PRUEBA = Object.freeze({
  tipo: 'corta',
  ancho: 80,
  copias: 1,
  corte: 'total',
  fechaHora: false,
  codigos: false,
  trazabilidad: false,
})

const CLAVE_PRUEBA = 'mobos:impresion:prueba'

/** Núcleo puro con el storage inyectado (se testea sin navegador). */
export function crearMemoriaPrueba(storage) {
  const leer = () => {
    try { return JSON.parse(storage?.getItem(CLAVE_PRUEBA) || '{}') || {} } catch { return {} }
  }
  const escribir = (datos) => {
    try { storage?.setItem(CLAVE_PRUEBA, JSON.stringify(datos)) } catch { /* sin almacenamiento */ }
  }
  return {
    plantillaDe: (destino) => ({ ...PLANTILLA_PRUEBA, ...(leer()[String(destino || '')] || {}) }),
    recordar: (destino, plantilla) => {
      if (!destino) return
      const datos = leer()
      const actual = { ...PLANTILLA_PRUEBA, ...(datos[String(destino)] || {}), ...(plantilla || {}) }
      datos[String(destino)] = {
        tipo: String(actual.tipo || PLANTILLA_PRUEBA.tipo),
        ancho: Number(actual.ancho) === 58 ? 58 : 80,
        copias: Math.min(5, Math.max(1, Number(actual.copias) || 1)),
        corte: actual.corte === 'parcial' ? 'parcial' : 'total',
        fechaHora: Boolean(actual.fechaHora),
        codigos: Boolean(actual.codigos),
        trazabilidad: Boolean(actual.trazabilidad),
      }
      escribir(datos)
    },
    olvidar: (destino) => {
      const datos = leer()
      delete datos[String(destino)]
      escribir(datos)
    },
    todas: () => leer(),
  }
}

const memoriaPrueba = crearMemoriaPrueba(typeof localStorage !== 'undefined' ? localStorage : null)

export const plantillaDePrueba = (destino) => memoriaPrueba.plantillaDe(destino)
export const recordarPlantillaDePrueba = (destino, plantilla) => memoriaPrueba.recordar(destino, plantilla)
export const olvidarPlantillaDePrueba = (destino) => memoriaPrueba.olvidar(destino)
export const memoriaDePrueba = () => memoriaPrueba.todas()
