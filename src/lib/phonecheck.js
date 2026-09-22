// PhoneCheck (#240): checklist de inspección por unidad + grado de condición.
// Lógica pura y testeable; la UI y el backend comparten estas reglas.
export const INSPECCION_ESTADOS = {
  ok: { label: 'OK', tone: 'green', puntaje: 1 },
  observacion: { label: 'Con observación', tone: 'orange', puntaje: 0.5 },
  falla: { label: 'Falla', tone: 'red', puntaje: 0 },
  na: { label: 'No aplica', tone: 'slate', puntaje: null },
}

export const INSPECCION_ITEMS = [
  { grupo: 'Pantalla', clave: 'pantalla', label: 'Pantalla / táctil', ayuda: 'Rayones, manchas, respuesta táctil.' },
  { grupo: 'Pantalla', clave: 'camaras', label: 'Cámaras (frontal y traseras)', ayuda: 'Enfoque, lente, flash.' },
  { grupo: 'Biometría', clave: 'faceId', label: 'Face ID / Touch ID', ayuda: 'Reconocimiento configurado y funcionando.' },
  { grupo: 'Audio', clave: 'audio', label: 'Altavoces y micrófono', ayuda: 'Llamada, altavoz, grabación.' },
  { grupo: 'Sensores', clave: 'sensores', label: 'Sensores', ayuda: 'Proximidad, luz, giroscopio.' },
  { grupo: 'Controles', clave: 'botones', label: 'Botones y vibración', ayuda: 'Encendido, volumen, silencio.' },
  { grupo: 'Conectividad', clave: 'conexiones', label: 'WiFi / Bluetooth / GPS', ayuda: 'Asocia redes y ubica.' },
  { grupo: 'Energía', clave: 'carga', label: 'Carga y puerto', ayuda: 'Carga por cable e inalámbrica.' },
  { grupo: 'Energía', clave: 'bateria', label: 'Batería', ayuda: 'Salud y ciclos.' },
  { grupo: 'Carcasa', clave: 'carcasa', label: 'Carcasa y chasis', ayuda: 'Golpes, doblez, humedad.' },
]

export const COSMETICOS = ['impecable', 'buen estado', 'marcas de uso', 'golpes visibles']

/** Puntaje 0-100: OK=1, observación=0,5, falla=0; «no aplica» no cuenta. */
export function puntajeInspection(inspection = {}) {
  const items = inspection.items || {}
  let suma = 0
  let cuenta = 0
  for (const item of INSPECCION_ITEMS) {
    const estado = items[item.clave]?.estado
    const valor = INSPECCION_ESTADOS[estado]?.puntaje
    if (valor === null || valor === undefined) continue
    suma += valor
    cuenta += 1
  }
  if (!cuenta) return null
  return Math.round((suma / cuenta) * 100)
}

/** Grado A/B/C a partir del puntaje (A ≥ 90, B ≥ 75, C el resto). */
export function gradoInspection(puntaje) {
  if (puntaje === null || puntaje === undefined) return null
  if (puntaje >= 90) return 'A'
  if (puntaje >= 75) return 'B'
  return 'C'
}

/** Cálculo completo (lo usan UI, route y demo). */
export function resumenInspection(inspection = {}) {
  const puntaje = puntajeInspection(inspection)
  return { puntaje, grado: gradoInspection(puntaje) }
}
