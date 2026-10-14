// Escala de anchos de campo (#389, docs/CAMPOS.md §2.1). El ancho lo resuelve
// el componente compartido, no la pantalla: en >=768px (`md:`) cada dato corto
// tiene un máximo según su contenido; en celular (360/390) ocupa todo el ancho
// disponible. Las clases se escriben completas para que Tailwind las detecte.
export const ANCHO_CAMPO = Object.freeze({
  telefono: 'md:max-w-[20rem]', // código de país + ~18-20 caracteres
  documento: 'md:max-w-[16rem]', // CI/RUC ~14-16 caracteres + botón Extraer adentro
  correo: 'md:max-w-[22rem]', // ~32 caracteres (+ sugerencias de dominio)
  ciudad: 'md:max-w-[18rem]', // ~24 caracteres
  pais: 'md:max-w-[14rem]', // ~18 caracteres
  etiqueta: 'md:max-w-[9rem]', // nombre de dirección: Casa, oficina…
  nombre: 'md:max-w-[24rem]', // nombre de persona o comercio (~30 caracteres)
  busqueda: 'md:max-w-[28rem]', // buscador de una lista o catálogo
  selector: 'md:max-w-[16rem]', // Select de opciones cortas (bloqueo, rol, estado)
  corto: 'md:max-w-[8rem]', // código postal, número corto (8-10 caracteres)
})

// Máximos en píxeles (rem de 16px) para los tests de layout.
export const ANCHO_CAMPO_PX = Object.freeze({
  telefono: 320, etiqueta: 144, nombre: 384, busqueda: 448, selector: 256, documento: 256, correo: 352, ciudad: 288, pais: 224, corto: 128,
})
