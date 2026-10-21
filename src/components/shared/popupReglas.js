// Reglas del Popup único (docs/PLANTILLA-OBJETOS.md §Popup): tipos, tamaños y
// orden de acciones viven acá, sin React, para probarlos y para que ninguna
// pantalla invente un ancho propio.

// Tipo → comportamiento por defecto. `rol` es el rol ARIA del diálogo
// (`alertdialog` cuando pide una decisión o avisa algo).
export const TIPOS_POPUP = {
  confirmar: { rol: 'alertdialog', tamano: 'sm' },
  aviso: { rol: 'alertdialog', tamano: 'sm' },
  formulario: { rol: 'dialog', tamano: 'md' },
  detalle: { rol: 'dialog', tamano: 'lg' },
}

// Ancho en escritorio (≥768 px). En móvil siempre es una hoja a todo el ancho.
export const ANCHOS_POPUP = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-3xl',
  xl: 'md:max-w-5xl',
}

export const TONOS_AVISO = ['info', 'ok', 'warn', 'bad']

// Duración de la salida animada (ms); con «reducir movimiento» no hay espera.
export const DURACION_SALIDA_POPUP = 180

export function resolverPopup({ tipo = 'formulario', tamano } = {}) {
  const base = TIPOS_POPUP[tipo] || TIPOS_POPUP.formulario
  const medida = ANCHOS_POPUP[tamano] ? tamano : base.tamano
  return { rol: base.rol, tamano: medida, ancho: ANCHOS_POPUP[medida] }
}

// Acciones del pie: si hay `peligro`, esa pasa a ser la acción principal
// (botón rojo) y la `primaria` se omite, así nunca hay dos principales.
// Devuelve la lista en orden de DOM (en móvil se invierte y la principal queda
// arriba; en escritorio queda a la derecha).
export function ordenarAcciones({ primaria, secundaria, peligro } = {}) {
  const lista = []
  if (secundaria) lista.push({ ...secundaria, variante: 'outline', clave: 'secundaria' })
  if (peligro) lista.push({ ...peligro, variante: 'danger', clave: 'peligro' })
  else if (primaria) lista.push({ ...primaria, variante: 'primary', clave: 'primaria' })
  return lista
}
