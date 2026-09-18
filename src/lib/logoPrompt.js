// Prompt listo para pegar en un chat de IA: genera las dos versiones del logo
// (oscura para modo claro, clara para modo oscuro) con las medidas y el peso
// que la app acepta. Se muestra en Configuración con un botón de copiar.

export const LOGO_LADO_PX = 1024
export const LOGO_ANCHO_PX = 1600
export const LOGO_ALTO_PX = 600
export const LOGO_MAX_BYTES = 1024 * 1024

export function promptLogo(empresa = 'mi empresa') {
  return `Actuá como diseñador de marca. Necesito el logo de «${empresa}» en DOS versiones, listas para usar en una app:

1. Versión OSCURA: pensada para fondos CLAROS (el elemento principal en un color oscuro).
2. Versión CLARA: pensada para fondos OSCUROS (el mismo diseño en blanco o en un color muy claro).

Requisitos de las dos versiones:
- Fondo TRANSPARENTE en PNG (sin fondo blanco, sin recuadro).
- El mismo diseño y las mismas proporciones en ambas: cambia solo el color para mantener el contraste.
- Formato cuadrado de ${LOGO_LADO_PX}×${LOGO_LADO_PX} px (si el logo es horizontal, ${LOGO_ANCHO_PX}×${LOGO_ALTO_PX} px), centrado y con un margen del 10 %.
- Sin sombras, sin degradados y sin texturas: colores planos, buen contraste y bordes limpios.
- Peso final: hasta 1 MiB por archivo.
- Entregá los dos archivos PNG por separado (logo-oscuro.png y logo-claro.png) e indicá el tamaño de cada uno.

Si partís de una imagen con fondo, quitalo antes de generar las versiones.`
}
