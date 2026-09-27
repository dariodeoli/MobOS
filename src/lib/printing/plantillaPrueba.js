// Plantilla del ticket de prueba (PRN + diseño): qué bloques incluye, el ancho
// del papel (58/80), la variante de corte y las copias. El editor vive en la
// ficha de la impresora (Configuración → Dispositivos → Impresoras → Probar) y
// la memoria es local por impresora, con el patrón «último usado»: es una
// selección, siempre cambiable, visible (se muestra «Recordada») y se puede
// restablecer a la configuración de la impresora.
//
// El núcleo es puro y recibe el storage: se testea sin navegador.
import { BLOQUES_TICKET_PRUEBA } from './tickets.js'

// Bloques de la plantilla, con su rótulo para el editor. Los ids son los del
// builder (`tickets.js`); el test de deriva verifica que no se desincronicen.
export const BLOQUES_PRUEBA = Object.freeze([
  { id: 'encabezado', etiqueta: 'Encabezado', detalle: 'Nombre de la app y tipo de prueba.' },
  { id: 'validacion', etiqueta: 'Número secreto', detalle: 'Código para confirmar la prueba en papel.' },
  { id: 'trazabilidad', etiqueta: 'Trazabilidad', detalle: 'Impresora, método, conexión, usuario y trabajo.' },
  { id: 'codigos', etiqueta: 'QR y código de barras', detalle: 'Para escanear la prueba y cruzarla en pantalla.' },
  { id: 'acentos', etiqueta: 'Acentos y símbolos', detalle: 'Línea de acentos y signos de apertura.' },
])

// Variantes del corte GS V (ver `escpos.js`) más «sin corte». Los ids son los
// que recibe `ticketPruebaTipo({ corte })`.
export const CORTES_PRUEBA = Object.freeze([
  { id: 'completo', etiqueta: 'Completo', detalle: 'El corte estándar de los recibos.' },
  { id: 'parcial', etiqueta: 'Parcial', detalle: 'Deja una tirita sin cortar.' },
  { id: 'avanza-completo', etiqueta: 'Avanza + completo', detalle: 'Avanza hasta la cuchilla y corta todo.' },
  { id: 'avanza-parcial', etiqueta: 'Avanza + parcial', detalle: 'Avanza hasta la cuchilla y corta parcial.' },
  { id: 'ninguno', etiqueta: 'Sin corte', detalle: 'Deja el papel unido al rollo (solo avanza).' },
])

export const ANCHOS_PRUEBA = Object.freeze([58, 80])
export const COPIAS_MAX = 5

const CLAVE = 'mobos:impresion:plantilla-prueba'

export const anchoDePlantilla = (ancho) => (Number(ancho) === 58 ? 58 : 80)
export const corteDePlantilla = (corte) => (CORTES_PRUEBA.some(({ id }) => id === corte) ? String(corte) : 'completo')
export const copiasDePlantilla = (copias) => Math.min(COPIAS_MAX, Math.max(1, Number(copias) || 1))

// Plantilla por defecto: la configuración de la impresora (ancho, corte,
// copias). El operador puede separarse de ella solo para la prueba.
export function plantillaDeImpresora(impresora = {}) {
  return {
    incluye: Object.fromEntries(BLOQUES_PRUEBA.map(({ id }) => [id, true])),
    ancho: anchoDePlantilla(impresora.ancho),
    corte: impresora.corte === false ? 'ninguno' : 'completo',
    copias: copiasDePlantilla(impresora.copias),
  }
}

// Normaliza cualquier plantilla (de memoria o del editor) contra los valores
// válidos: nunca se imprime con opciones rotas.
export function normalizarPlantilla(plantilla = {}, impresora = {}) {
  const base = plantillaDeImpresora(impresora)
  const incluye = { ...base.incluye }
  for (const id of BLOQUES_TICKET_PRUEBA) {
    if (typeof plantilla.incluye?.[id] === 'boolean') incluye[id] = plantilla.incluye[id]
  }
  return {
    incluye,
    ancho: anchoDePlantilla(plantilla.ancho ?? base.ancho),
    corte: corteDePlantilla(plantilla.corte ?? base.corte),
    copias: copiasDePlantilla(plantilla.copias ?? base.copias),
  }
}

/** Núcleo puro: mismo comportamiento con localStorage o un mock. */
export function crearMemoriaPlantilla(storage) {
  const leer = () => {
    try { return JSON.parse(storage?.getItem(CLAVE) || '{}') || {} } catch { return {} }
  }
  const escribir = (datos) => {
    try { storage?.setItem(CLAVE, JSON.stringify(datos)) } catch { /* sin almacenamiento */ }
  }
  return {
    /** Plantilla recordada de una impresora, o null si nunca se usó. */
    de: (impresoraId) => leer()[String(impresoraId)] || null,
    recordar: (impresoraId, plantilla) => {
      if (!impresoraId) return
      const datos = leer()
      datos[String(impresoraId)] = normalizarPlantilla(plantilla)
      escribir(datos)
    },
    olvidar: (impresoraId) => {
      const datos = leer()
      delete datos[String(impresoraId)]
      escribir(datos)
    },
  }
}

export const memoriaPlantilla = () => crearMemoriaPlantilla(typeof localStorage !== 'undefined' ? localStorage : null)
