# Recortador de foto de perfil: la foto entra completa (#perfil)

**Síntoma (Dario):** al subir una foto vertical, el recortador arrancaba con
zoom automático: la imagen se dibujaba a `240 × escala` y el cuadrado visible
mostraba solo el centro, sin que el usuario lo pidiera.

**Causa:** el dibujo y el mapeo del recorte no compartían la misma escala. El
`<img>` se pintaba con `width = 240 × escala` (independiente del tamaño real de
la foto) mientras `recorteCuadrado` interpreta `escala` como píxeles de origen;
con fotos verticales eso dejaba el cuadrado en el centro de la imagen.

**Arreglo**

- Nueva base de encuadre `escalaAjuste({ ancho, alto, lado })`: **contain** (la
  dimensión más larga entra justa). El dibujo pasa a `ancho × factor` /
  `alto × factor`, consistente con el mapeo del recorte.
- El **zoom del usuario** (1× a 3× sobre el ajuste) sale del slider, que ahora
  muestra «Zoom · n×»; al abrir siempre es 1.
- `recorteCuadrado` centra el cuadrado sobre la **imagen** cuando la foto entra
  entera (antes, sin zoom, una foto vertical devolvía el cuadrado del borde).
- El recorte final sigue siendo **cuadrado 512** (`LADO_FOTO`), como antes.

## Medición (foto vertical 600×1200, contenedor 240)

| Estado | Al abrir | A 2,5× |
|---|---|---|
| **Antes** (producción v1.0.186) | **240×480** (solo el centro) | 600×1200 |
| **Después** (rama) | **120×240** (entera) | 300×600 |

Capturas en los tres modos: `01-al-abrir` (claro, escritorio),
`02-zoom-2.5x`, `03-al-abrir-oscuro-desktop` y `04-al-abrir-claro-mobile` en
`docs/qa/recorte-perfil/{antes,despues}/` — en el «antes» se ve solo el centro;
en el «después», las tres marcas 1-2-3. Se reproducen con
`node scripts/qa-recorte-foto.mjs` (`QA_BASE_URL` para el host).

## Tests

- `src/utils/recorte.test.js`: escala de ajuste (vertical/horizontal/cuadrada/
  chica/inválida), recorte centrado con la foto entera y zoom del usuario.
- `e2e/recorte-perfil.spec.js` (proyecto `core`): con una foto vertical generada
  en el navegador, el recortador abre en 120×240 (contain), el slider arranca en
  1 y a 2,5× la imagen mide 300×600.

## Coordinación con CMP

`PhotoCropper` y `utils/recorte.js` viven en la app; la biblioteca **no** publica
un recortador. Queda anotado para CMP: publicar el objeto (con la base contain y
el test de cálculo) y adoptarlo acá, así Config (logos por variante) y cualquier
otra app lo reutilizan sin copia local.
