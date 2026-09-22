// Tamaños del modal (#237): el ancho máximo vive en el objeto y no en cada uso.
// `formulario` es el predeterminado para que un `<Modal>` sin `size` ya quede
// alineado con el estándar.
export const TAMANOS_MODAL = {
  corto: 'max-w-md', // avisos, confirmaciones y formularios de un solo campo
  formulario: 'max-w-xl', // formularios de una columna
  amplio: 'max-w-3xl', // formularios de dos columnas, tablas y contenido amplio
  completo: 'max-w-5xl', // editores y pantallas grandes
}

export const TAMANO_MODAL_PREDETERMINADO = 'formulario'
