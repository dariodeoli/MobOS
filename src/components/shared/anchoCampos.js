// Escala de anchos de campo (#389, docs/CAMPOS.md §2.1). El ancho lo resuelve
// el componente compartido, no la pantalla: en >=768px (`md:`) cada dato corto
// tiene un máximo según su contenido; en celular (360/390) ocupa todo el ancho
// disponible. Las clases se escriben completas para que Tailwind las detecte.
export const ANCHO_CAMPO = Object.freeze({
  telefono: 'md:max-w-[22rem]', // código de país + ~18-20 caracteres
  documento: 'md:max-w-[18rem]', // CI/RUC ~14-16 caracteres + botón Extraer adentro
  correo: 'md:max-w-[26rem]', // ~32 caracteres
  ciudad: 'md:max-w-[20rem]', // ~24 caracteres
  pais: 'md:max-w-[16rem]', // ~18 caracteres
  corto: 'md:max-w-[8rem]', // código postal, número corto (8-10 caracteres)
})

// Máximos en píxeles (rem de 16px) para los tests de layout.
export const ANCHO_CAMPO_PX = Object.freeze({
  telefono: 352, documento: 288, correo: 416, ciudad: 320, pais: 256, corto: 128,
})
