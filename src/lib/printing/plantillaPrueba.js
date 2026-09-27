// Plantilla del ticket de prueba (#277, PRN + diseño): tipo (el corto es el
// predeterminado), qué bloques incluye, el ancho del papel (58/80), la variante
// de corte y las copias. El editor vive en la ficha de la impresora
// (Configuración → Dispositivos → Impresoras → Probar).
//
// Persistencia en dos capas: la impresora del backend guarda `testTemplate`
// (viaja entre dispositivos) y, si no se pudo guardar o no hay backend (demo),
// la memoria local por impresora mantiene el patrón «último usado»: es una
// selección, siempre cambiable, visible y restablecible.
//
// El núcleo es puro y recibe el storage: se testea sin navegador.
import { BLOQUES_TICKET_PRUEBA, TIPOS_TICKET_PRUEBA } from './tickets.js'

// Bloques de la plantilla, con su rótulo para el editor. Los ids son los del
// builder (`tickets.js`); el test de deriva verifica que no se desincronicen.
export const BLOQUES_PRUEBA = Object.freeze([
  { id: 'encabezado', etiqueta: 'Encabezado', detalle: 'Nombre de la app y tipo de prueba.', porDefecto: true },
  { id: 'validacion', etiqueta: 'Número secreto', detalle: 'Código para confirmar la prueba en papel.', porDefecto: true },
  { id: 'trazabilidad', etiqueta: 'Trazabilidad', detalle: 'Impresora, método, conexión, usuario y trabajo.', porDefecto: true },
  { id: 'codigos', etiqueta: 'QR y código de barras', detalle: 'Para escanear la prueba y cruzarla en pantalla.', porDefecto: true },
  { id: 'acentos', etiqueta: 'Acentos y símbolos', detalle: 'Línea de acentos y signos de apertura.', porDefecto: true },
  { id: 'fecha', etiqueta: 'Fecha y hora', detalle: 'Solo en el ticket corto; en el completo va con la trazabilidad.', porDefecto: false },
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
// El ticket corto es el predeterminado (#277): menos papel y más rápido. El
// tipo elegido se recuerda con la plantilla (último usado = predeterminado).
export const TIPO_PRUEBA_POR_DEFECTO = 'breve'

const CLAVE = 'mobos:impresion:plantilla-prueba'

export const anchoDePlantilla = (ancho) => (Number(ancho) === 58 ? 58 : 80)
export const corteDePlantilla = (corte) => (CORTES_PRUEBA.some(({ id }) => id === corte) ? String(corte) : 'completo')
export const copiasDePlantilla = (copias) => Math.min(COPIAS_MAX, Math.max(1, Number(copias) || 1))
export const tipoDePlantilla = (tipo) => (Object.hasOwn(TIPOS_TICKET_PRUEBA, String(tipo || '')) ? String(tipo) : TIPO_PRUEBA_POR_DEFECTO)

// Bloques que aplican a cada tipo: el corto solo lleva título, validación y
// fecha; el resto admite todos.
export const bloquesDeTipo = (tipo) => (tipoDePlantilla(tipo) === 'breve'
  ? ['encabezado', 'validacion', 'fecha']
  : BLOQUES_PRUEBA.map(({ id }) => id))

// Plantilla por defecto: ticket corto con la configuración de la impresora
// (ancho, corte, copias). El operador puede separarse de ella para la prueba.
export function plantillaDeImpresora(impresora = {}) {
  return {
    tipo: TIPO_PRUEBA_POR_DEFECTO,
    incluye: Object.fromEntries(BLOQUES_PRUEBA.map(({ id, porDefecto }) => [id, porDefecto])),
    ancho: anchoDePlantilla(impresora.ancho),
    corte: impresora.corte === false ? 'ninguno' : 'completo',
    copias: copiasDePlantilla(impresora.copias),
  }
}

// Normaliza cualquier plantilla (de memoria, del servidor o del editor) contra
// los valores válidos: nunca se imprime con opciones rotas.
export function normalizarPlantilla(plantilla = {}, impresora = {}) {
  const base = plantillaDeImpresora(impresora)
  const incluye = { ...base.incluye }
  for (const id of BLOQUES_TICKET_PRUEBA) {
    if (typeof plantilla.incluye?.[id] === 'boolean') incluye[id] = plantilla.incluye[id]
  }
  return {
    tipo: tipoDePlantilla(plantilla.tipo ?? base.tipo),
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
