import { borrarDemo, guardarDemo, leerDemo } from './demoStorage.js'

// Patrón «último usado como predeterminado» (#209): donde algo se elige todo el
// tiempo, la última selección vuelve seleccionada la próxima vez. Es una
// comodidad, nunca una decisión del sistema: el control muestra el valor
// recordado en su lugar habitual y se puede cambiar en el mismo gesto.
//
// Reglas (docs/ULTIMO-USADO.md):
// - Solo selecciones frecuentes: nunca permisos, seguridad, importes ni
//   acciones destructivas.
// - Claves con namespace `mobos:<área>:<dato>` (ej. `mobos:pos:vendedor`).
// - Lectura/escritura protegidas: sin almacenamiento no rompe y se usa el
//   default sensato de la pantalla.
// - Validación al leer: si la opción guardada ya no existe en ese contexto, se
//   cae al default (`valido`).
// - En la demo vive en memoria de la pestaña (demoStorage) y se descarta al
//   recargar.
// - Los cambios avisan (`EVENTO_ULTIMO_USADO`) para que todos los controles que
//   usan la misma clave queden sincronizados en la pestaña; el hook además
//   escucha el evento `storage` para sincronizar entre pestañas.

const PREFIJO = 'mobos:'
// Namespace del primer deploy del patrón (inventario, v1.0.131): si el navegador
// lo tiene guardado, se migra al namespace único al leer.
const PREFIJO_PRIMER_DEPLOY = 'mobos:ultimo:'

/** Se emite con `detail: { clave }` cada vez que cambia un valor recordado. */
export const EVENTO_ULTIMO_USADO = 'mobos:ultimo-usado'

/** `pos:vendedor` → `mobos:pos:vendedor`. Devuelve null si no hay clave usable. */
export function claveUltimo(clave) {
  const limpia = String(clave || '').trim().replace(/^mobos:(ultimo:)?/, '')
  return limpia ? `${PREFIJO}${limpia}` : null
}

// Compatibilidad de lectura: los valores viejos se guardaron crudos (no JSON).
function decodificar(guardado) {
  try {
    return JSON.parse(guardado)
  } catch {
    return guardado
  }
}

function clavesDeLectura(clave, legado) {
  const principal = claveUltimo(clave)
  const limpia = String(clave || '').trim().replace(/^mobos:(ultimo:)?/, '')
  const viejas = (Array.isArray(legado) ? legado : [legado]).filter(Boolean)
  const primerDeploy = limpia && `${PREFIJO_PRIMER_DEPLOY}${limpia}` !== principal ? `${PREFIJO_PRIMER_DEPLOY}${limpia}` : null
  return [...new Set([principal, ...viejas, primerDeploy].filter(Boolean))]
}

function guardarSinAviso(destino, valor) {
  guardarDemo(destino, JSON.stringify(valor))
}

function anunciarCambio(clave) {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(EVENTO_ULTIMO_USADO, { detail: { clave } }))
  } catch {
    /* entorno sin window: no hay nada que avisar */
  }
}

/**
 * Valor recordado para `clave`, o `porDefecto` si no hay nada válido.
 * Acepta `leerUltimo(clave, { porDefecto, valido, legado })` y, por
 * compatibilidad, `leerUltimo(clave, porDefecto)`.
 * `valido(valor)` decide si lo guardado sigue sirviendo en este contexto.
 * `legado` es una (o varias) claves viejas: si tienen el valor, se devuelve y se
 * migra al namespace nuevo (write-through sin aviso, para no tocar estado
 * durante el render).
 */
export function leerUltimo(clave, opciones = {}) {
  const config = typeof opciones === 'object' && opciones !== null ? opciones : { porDefecto: opciones }
  const { porDefecto = '', valido, legado } = config
  for (const [indice, candidata] of clavesDeLectura(clave, legado).entries()) {
    const guardado = leerDemo(candidata)
    if (guardado === null || guardado === '') continue
    const valor = decodificar(guardado)
    if (typeof valido === 'function' && !valido(valor)) return porDefecto
    if (indice > 0) {
      // Normaliza el namespace viejo: el valor queda en `mobos:<área>:<dato>` y
      // la clave legada se retira para no arrastrarla.
      const destino = claveUltimo(clave)
      if (destino) guardarSinAviso(destino, valor)
      borrarDemo(candidata)
    }
    return valor
  }
  return porDefecto
}

/**
 * Guarda la selección para la próxima vez. Un valor vacío (null, undefined o
 * cadena vacía) olvida la clave. Nunca lanza y avisa a los controles sincronizados.
 */
export function recordarUltimo(clave, valor) {
  const destino = claveUltimo(clave)
  if (!destino) return valor
  if (valor === null || valor === undefined || valor === '') borrarDemo(destino)
  else guardarSinAviso(destino, valor)
  anunciarCambio(clave)
  return valor
}

/** Olvida lo recordado: la próxima lectura vuelve al default de la pantalla. */
export function olvidarUltimo(clave) {
  const destino = claveUltimo(clave)
  if (!destino) return
  borrarDemo(destino)
  anunciarCambio(clave)
}
