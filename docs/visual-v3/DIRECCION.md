# Dirección visual v3 — «menos planilla, más producto»

Estructura Shopify y mobile first intactas; cambia el **lenguaje visual**. Código: `src/styles/visual-v3.css` (capa global sobre el shell `.shell-nav-v2` y las ventanas `.v3-portal`) + paleta del shell en `src/components/app/shellNavigation.css`. Prototipo: `docs/visual-v3/prototipo.html`.

## Diagnóstico (por qué se ve «Excel»)
1. Cada bloque es un rectángulo con borde gris 1px: tarjetas, tiras de KPI, listas, botones-tile (Inicio, Pedido, POS).
2. Las líneas mandan: grilla de KPI con divisores en cruz, filas de Pedidos con `border-top` y barra de color a la izquierda, filas de Productos como cajas verdes con borde.
3. Cajas dentro de cajas: «Información de pago» dentro de tarjeta con sub-bordes; carrito del POS dentro de un bloque bordeado dentro de otro.
4. Lienzo gris-azulado frío y sidebar blanca con línea: no hay plano de fondo vs. plano de contenido.
5. Jerarquía tipográfica corta: título de página 24px/500, cifras KPI 20px, cuerpo 13px — todo pesa parecido.
6. Cabeceras de tabla en MAYÚSCULAS espaciadas (PRODUCTO, CATEGORÍA, SKU…).
7. Chips con borde + punto: parecen celdas, no estados.
8. Sombras planas o ninguna (`box-shadow: none` explícito en POS e Inicio).
9. Radios chicos (8–10px) y heterogéneos.
10. Oscuro = claro invertido azulado (paneles 31 36 48), sin capas de elevación.

## Principios
- **Superficie, no línea.** Lienzo con tinte cálido; tarjetas blancas elevadas con sombra en capas (anillo de luz + contacto + ambiente). El borde conserva su ancho (sin saltos de layout) pero queda transparente.
- **Sin caja en caja.** Una tarjeta dentro de otra se aplana a relleno tonal (`ink-800`), sin sombra.
- **Hairline.** Divisores internos al 70 % de `ink-600`; nunca líneas verticales en tablas.
- **Jerarquía fuerte.** Título de página 26/32 700 (−0.03em), saludo 26px, cifras KPI 700 con tracking negativo, números tabulares en todo el shell; cabeceras en oración, sin MAYÚSCULAS.
- **Color con intención.** Neutros cálidos; marca en gradiente (`fono-dark → fono`) solo para héroes (Vender, KPI destacado); primario sólido con bisel (Polaris); estados como chips tonales en píldora sin borde.

## Decisiones concretas
| Tema | Claro | Oscuro |
|---|---|---|
| Lienzo `paper` | 244 244 240 | 10 11 13 |
| Tarjeta `ink` / elevada `ink-800` | 255 / 249 249 246 | 23 25 29 / 29 32 37 (más clara = más alta) |
| Hover `ink-700` · línea `ink-600` | 239 240 235 · 228 229 222 | 36 39 45 · 50 54 62 |
| Texto `fore` / `mute` | 16 20 18 / 84 92 90 (≥6:1) | 243 244 246 / 165 172 182 (≥6:1) |

- **Radios:** tarjetas 16 · ventanas 22 · campos 12 · botones 10 · chips píldora.
- **Elevación:** `--v3-elev-1` (tarjeta), `-2` (hover de tarjeta tocable), `-3` (ventanas). En oscuro: anillo blanco 5–8 % + reflejo superior.
- **Navegación:** sidebar del color del lienzo y sin línea; ítem activo = píldora blanca elevada. Topbar y barra inferior móvil en vidrio (`blur 18px`, con caída a sólido si no hay soporte).
- **Listas:** escritorio = filas aireadas sin grilla, hover tonal con anillo hairline; móvil = filas-tarjeta (código, cliente, monto a la derecha, chips abajo). Alto de fila sin cambios (contrato de densidad #448).
- **KPI:** una tarjeta, separadores hairline, sparkline existente, sin franja verde superior.
- **Vacíos:** ícono en contenedor tonal de marca 56px con halo. **Carga:** esqueletos con brillo, no spinners.
- **Movimiento:** 160ms `cubic-bezier(.2,.8,.2,1)`; hover lift (sombra), press `scale(.985)`, aparición de página solo por opacidad (no mueve geometría). Todo se apaga con `prefers-reduced-motion`.
- **Accesibilidad:** el texto mantiene AA (los tonos de texto no bajan; el lienzo es más claro/oscuro). Controles cuyo borde es la única affordance (outline, inputs, tiles del POS) conservan `--c-interactivo` ≥3:1. Targets de 44px intactos; 375px sin scroll horizontal.

## Reglas para pantallas nuevas
Usá `Card`/superficies `bg-ink rounded-xl border` y la capa v3 las eleva sola; no agregues `box-shadow: none` ni bordes `ink-600` a mano; para un bloque interno usá relleno `bg-ink-800` sin borde; estados con `Badge`/`ChipEstado`.
