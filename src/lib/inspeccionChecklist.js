// Reglas puras del checklist de inspección (#240): catálogo de secciones/ítems,
// estados del semáforo, valor inicial y resumen con puntaje/grado provisional.
// Vive en `lib` para poder testearlo sin render (la UI está en
// `components/inventory/ChecklistInspeccion`).

export const SECCIONES_INSPECCION = [
  { id: 'pantalla', titulo: 'Pantalla', items: [['tactil', 'Táctil y multitouch'], ['imagen', 'Imagen: manchas o líneas'], ['brillo', 'Brillo y True Tone']] },
  { id: 'camaras', titulo: 'Cámaras', items: [['trasera', 'Cámara trasera y flash'], ['frontal', 'Cámara frontal'], ['video', 'Grabación de video']] },
  { id: 'biometria', titulo: 'Face ID / Touch ID', items: [['biometria', 'Reconocimiento funcionando']] },
  { id: 'audio', titulo: 'Audio', items: [['altavoz', 'Altavoz y auricular'], ['microfono', 'Micrófonos'], ['vibracion', 'Vibración']] },
  { id: 'sensores', titulo: 'Sensores', items: [['proximidad', 'Proximidad y luz'], ['giroscopio', 'Giroscopio y acelerómetro'], ['brujula', 'Brújula y GPS']] },
  { id: 'botones', titulo: 'Botones', items: [['encendido', 'Encendido y volumen'], ['silencioso', 'Silencioso / acción']] },
  { id: 'conectividad', titulo: 'Conectividad', items: [['wifi', 'WiFi y Bluetooth'], ['senal', 'Señal celular y SIM'], ['carga', 'Puerto de carga']] },
  { id: 'bateria', titulo: 'Carga y batería', items: [['bateria', 'Salud de batería'], ['carga_rapida', 'Carga y cable']] },
  { id: 'carcasa', titulo: 'Carcasa', items: [['carcasa', 'Carcasa y marco'], ['tapa', 'Tapa y sellado'], ['camaras_lente', 'Lentes de cámara']] },
]

export const ESTADOS_ITEM = [
  { id: 'pasa', etiqueta: 'Pasa', icono: 'check' },
  { id: 'falla', etiqueta: 'Falla', icono: 'alert' },
  { id: 'na', etiqueta: 'N/A', icono: 'close' },
]

export const valorInicialChecklist = () => ({
  items: Object.fromEntries(SECCIONES_INSPECCION.flatMap((seccion) => seccion.items.map(([id]) => [id, '']))),
  notas: {},
  bateriaSalud: '',
  bateriaCiclos: '',
})

// Ítems críticos del catálogo (una falla acá baja el grado a C).
const PIEZAS_CLAVE = ['tactil', 'imagen', 'biometria', 'bateria', 'senal', 'trasera', 'carga']

/** Resumen del checklist: progreso, conteos, puntaje 0-100 y grado provisional. */
export function resumenChecklist(valor = {}) {
  const items = valor.items || {}
  const todos = SECCIONES_INSPECCION.flatMap((seccion) => seccion.items.map(([id]) => id))
  const revisados = todos.filter((id) => items[id] === 'pasa' || items[id] === 'falla' || items[id] === 'na')
  const pasan = todos.filter((id) => items[id] === 'pasa').length
  const fallan = todos.filter((id) => items[id] === 'falla')
  const aplicables = revisados.filter((id) => items[id] !== 'na').length || 1
  const puntaje = Math.round((pasan / aplicables) * 100)
  const salud = Number(valor.bateriaSalud)
  const saludOk = Number.isFinite(salud) && salud > 0 ? salud >= 85 : null
  const fallaClave = fallan.some((id) => PIEZAS_CLAVE.includes(id))
  let grado = ''
  if (revisados.length === todos.length) {
    if (fallaClave || saludOk === false) grado = 'C'
    else if (fallan.length > 0) grado = 'B'
    else grado = 'A'
  }
  return {
    total: todos.length,
    revisados: revisados.length,
    progreso: Math.round((revisados.length / todos.length) * 100),
    pasan,
    fallan: fallan.length,
    porcentaje: revisados.length ? puntaje : 0,
    grado,
    saludBateria: Number.isFinite(salud) && salud > 0 ? salud : null,
    ciclos: Number(valor.bateriaCiclos) > 0 ? Number(valor.bateriaCiclos) : null,
  }
}
