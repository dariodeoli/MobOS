# Reglas de pantallas (MobOS)

Regla viva del rediseño, hermana de `docs/CAMPOS.md`, `docs/TABLAS.md` y `docs/TOKENS.md`. Cada pantalla se arma con los bloques compartidos; si falta uno, se agrega al bloque, no a la pantalla.

## Las 12 reglas

1. **Densidad.** Filas de escritorio de 36 px (`px-3 py-2`); 44 px táctil por debajo de `lg`. Cuerpo 13–14 px; 12 px solo metadatos, nunca acciones.
2. **Tipografía.** H1 22/28 semibold; sección 16/24; cuerpo 14/20; meta 12/16; encabezado de tabla 10 px en mayúsculas. Importes con `tabular-nums`, alineados a la derecha y siempre completos (`Gs. 12.500.000`).
3. **Espaciado.** Solo 4/8/12/16/24/32. Márgenes laterales 16 en celular y 24 en escritorio; del encabezado al contenido 12.
4. **Un solo encabezado.** H1 = sección principal; la acción principal de la pestaña activa en la misma fila, a la derecha; una sola fila de `SectionTabs` debajo. Sin sobretítulo ni miga visible (`shell-breadcrumb` queda `sr-only`) ni select «Destinos de X». Una palabra aparece como mucho dos veces (H1 + pestaña activa).
5. **Dos niveles de navegación como máximo.** N1 `SectionTabs` del shell; N2 control segmentado dentro de la barra de herramientas. Nunca una tercera fila de pestañas.
6. **Las pestañas nunca son un `select` nativo.** Por debajo de `lg`, tira horizontal de pestañas de 44 px con degradé en los bordes; en escritorio van en línea y el excedente pasa a un popover «Más» medido.
7. **La barra de herramientas es de la pestaña** (`shared/Toolbar`): búsqueda · filtros · vista · acción principal · Más. Una pestaña sin configuración no dibuja barra. `BarraModulo` es solo un shim de compatibilidad.
8. **Tablas y listados** (`shared/ListaDensa` con `columns` + `renderCard`). Desde `md`, tabla en grilla que entra en 1280 sin scroll horizontal. Por debajo de `md`, una tarjeta por fila (título, meta, importe, estado; acciones en Más). Nada de `min-w` + `overflow-x` bajo `md`. Pie `PieListado` con paginador de 44 px. `desde` (`md` por defecto, `lg` o `xl`) mueve el corte de tabla a tarjeta: las filas con controles adentro (inputs, selects) o con muchas columnas usan `lg`/`xl`; `atributosFila` agrega `data-testid` a la fila o tarjeta.
9. **Formularios.** Valores compuestos en una fila con un solo borde (`shared/FieldRow`: prefijo, input, botón final). Etiqueta arriba, 44 px, máximo 640 px en escritorio y dos columnas desde `lg`.
10. **Un solo chip de estado** (`shared/StatusChip` leyendo `lib/estados.js`): tonos `ok`/`warn`/`bad`/`neutral`, contraste ≥ 4.5 en claro y oscuro, `w-fit`. Un estado se muestra una sola vez por fila.
11. **Estados vacíos** con `EmptyState` de owncoding-ui: ícono, una frase y una acción. Sin textos de depuración.
12. **Cromo móvil ≤ 64 px.** Solo la barra de la app queda fija (56 + zona segura) con la sucursal adentro; el aviso demo y «Cómo funciona» pasan a un aviso de una línea, descartable y dentro del flujo; navegación inferior de 56.
13. **Detalles y vistas previas = ventana centrada, nunca panel lateral** (#386). Un solo componente, `shared/VentanaDetalle` (compone el `Modal` de owncoding-ui): centrada en escritorio con tamaño `sm|md|lg|xl`, encabezado fijo con X roja de 44 px, pantalla completa con margen seguro en celular; Esc y clic afuera cierran salvo `busy`/`dirty`. No usar `<Drawer`.

## Bloques compartidos

| Bloque | Dónde | Regla |
|---|---|---|
| `Toolbar` | `components/shared/Toolbar.jsx` | 7 |
| `ListaDensa` (+ `PieListado`, `usePaginaLista`) | `components/shared/` | 8 |
| `FieldRow` | `components/shared/FieldRow.jsx` | 9 |
| `StatusChip` + `estados.js` | `components/shared/`, `lib/` | 10 |
| `EstadoSelect` (estado editable con forma de chip) | `components/shared/EstadoSelect.jsx` | 10 (un solo control, nunca badge + select) |
| `Stat` `compact` + `StatGrid` | `components/ui/index.jsx`, `components/shared/StatGrid.jsx` | 1, 2 (2 columnas en celular) |

## Aceptación común (QA-A)

Sin scroll horizontal a 375/768/1280/1440 en claro y oscuro; objetivos interactivos ≥ 44×44 por debajo de `lg` (enlaces en línea exceptuados); sin cajas interactivas que se crucen; importes sin cortar (`.tabular-nums` con `scrollWidth ≤ clientWidth`); contraste ≥ 4.5; Esc cierra los overlays.

La página DEV `/bloques-preview` (`src/pages/preview/BloquesPreview.jsx`, no existe en producción) muestra cada bloque; `e2e/frontend/blocks-preview.frontend.spec.js` verifica esos puntos a 375 y 1280.
