// Puente entre el `BuscadorDispositivo` de la biblioteca (#250) y las piezas
// que usan el formulario y las listas: el objeto compone la etiqueta con
// `etiquetaDispositivo` («iPhone 15 · 256 GB · Azul») y acá se vuelve a abrir
// para editar una orden existente o para mostrar el modelo separado de sus
// variantes. Una sola convención de separador para toda la app.
const SEPARADOR = ' · '

// «iPhone 15 · 256 GB · Azul» → { modelo: 'iPhone 15', capacidad: '256 GB', color: 'Azul' }
// También acepta etiquetas parciales («MacBook Air M2») o vacías.
export function partesDispositivo(etiqueta) {
  const [modelo = '', capacidad = '', color = ''] = String(etiqueta || '')
    .split(SEPARADOR)
    .map((parte) => parte.trim())
  return { modelo, capacidad, color }
}

// «iPhone 15 · 256 GB · Azul» → «256 GB · Azul»: lo que se muestra al costado
// del modelo cuando la lista quiere destacarlo.
export function varianteDispositivo(etiqueta) {
  const { capacidad, color } = partesDispositivo(etiqueta)
  return [capacidad, color].filter(Boolean).join(SEPARADOR)
}

// Tipo del checklist de recepción a partir del modelo: el buscador de servicio
// elige el modelo y el tipo se sincroniza solo (misma familia de `DEVICE_TYPES`).
const FAMILIAS = [
  ['MacBook', /^mac/i],
  ['iPad', /^ipad/i],
  ['iPhone', /^iphone/i],
  ['AirPods', /^airpods/i],
  ['Apple Watch', /^(apple\s*watch|watch)/i],
]

export function tipoDeDispositivo(modelo) {
  const texto = String(modelo || '').trim()
  if (!texto) return 'Otros'
  const familia = FAMILIAS.find(([, patron]) => patron.test(texto))
  return familia ? familia[0] : 'Otros'
}
