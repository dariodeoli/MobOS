// Plantilla del ticket de prueba (#277, PRN + diseño): tipo (el corto es el
// predeterminado), ancho del papel (58/80), si el corto lleva fecha/hora,
// variante de corte y copias. El modelo canónico vive en la biblioteca
// (`PLANTILLA_PRUEBA` / `plantillaDePrueba`, owncoding-ui) y acá queda el
// adaptador de la app: la configuración de la impresora como punto de partida,
// la normalización y la memoria local como respaldo del backend.
//
// Persistencia en dos capas: la impresora del backend guarda `testTemplate`
// (viaja entre dispositivos) y, si no se pudo guardar o no hay backend (demo),
// la memoria local por impresora mantiene el patrón «último usado»: es una
// selección, siempre cambiable, visible y restablecible.
//
// El núcleo es puro y recibe el storage: se testea sin navegador.
import { ANCHOS_PRUEBA, CORTES_PRUEBA as VARIANTES_CORTE, PLANTILLA_PRUEBA, plantillaDePrueba } from 'owncoding-ui'

export { ANCHOS_PRUEBA }

// Variantes de corte GS V de la biblioteca, rotuladas para el editor.
const ETIQUETAS_CORTE = {
  'completo': 'Completo',
  'parcial': 'Parcial',
  'avanza-completo': 'Avanza + completo',
  'avanza-parcial': 'Avanza + parcial',
}
export const CORTES_PRUEBA = Object.freeze(VARIANTES_CORTE.map((id) => ({ id, etiqueta: ETIQUETAS_CORTE[id] || id })))

export const COPIAS_MAX = 5
// El ticket corto es el predeterminado (#277): menos papel y más rápido.
export const TIPO_PRUEBA_POR_DEFECTO = PLANTILLA_PRUEBA.tipo

const CLAVE = 'mobos:impresion:plantilla-prueba'

// Plantilla por defecto: el ticket corto de la biblioteca con la configuración
// de la impresora (ancho y copias). El operador puede separarse de ella solo
// para la prueba.
export function plantillaDeImpresora(impresora = {}) {
  return plantillaDePrueba({
    tipo: TIPO_PRUEBA_POR_DEFECTO,
    ancho: impresora.ancho,
    copias: impresora.copias,
  })
}

// Normaliza cualquier plantilla (de memoria, del servidor o del editor) contra
// el contrato de la biblioteca: nunca se imprime con opciones rotas.
export function normalizarPlantilla(plantilla = {}, impresora = {}) {
  const base = plantillaDeImpresora(impresora)
  return plantillaDePrueba({ ...base, ...(plantilla && typeof plantilla === 'object' ? plantilla : {}) })
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
